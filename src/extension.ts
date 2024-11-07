import * as child_process from "child_process";
import * as vscode from 'vscode';
import { ExtensionContext, OutputChannel } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, ExecuteCommandParams, ExecuteCommandRequest, DidChangeConfigurationParams, DidChangeConfigurationNotification } from 'vscode-languageclient/node';
import * as path from "path";
import * as semver from "semver";
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import * as fs from "fs";
import decompress from 'decompress';
import { ProxyAgent } from 'proxy-agent';

let client: LanguageClient;
let outputChannel: OutputChannel;

export function activate(context: ExtensionContext) {

	outputChannel = vscode.window.createOutputChannel("TTCN-3", "ttcn3-out");
	context.subscriptions.push(outputChannel);

	const conf = vscode.workspace.getConfiguration('ttcn3');

	// Our work is done, if the user does not want to run a language server.
	if (!conf.get('useLanguageServer') && !conf.get('server.enabled')) {
		outputChannel.appendLine('Language server is disabled. If you like to use features like go to definition, enable the language server by opening vscode settings and set ttcn3.useLanguageServer to true. For more information about the TTCN-3 language server, have a look at https://nokia.github.io/ntt/editors/');

		context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.restart", async () => {
			outputChannel.appendLine("Restart command is not available, please enable TTCN-3 Language Server in vscode settings.");
		}));

		context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.status", async () => {
			outputChannel.appendLine("Status command is not available, please enable TTCN-3 Language Server in vscode settings.");
		}));

		context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.debug.toggle", async () => {
			outputChannel.appendLine("Toggle debug command is not available, please enable TTCN-3 Language Server in vscode settings.");
		}));
		return;
	}

	const initTasks: Promise<void>[] = [];

	initTasks.push(withSpinningStatus(context, async status => {
		await activateLanguageServer(context, status, conf);
	}));
}

async function withSpinningStatus(context: vscode.ExtensionContext, action: (status: Status) => Promise<void>): Promise<void> {
	const status = new StatusBarEntry(context, "$(sync~spin)");
	status.show();
	await action(status);
	status.dispose();
}

async function getInstalledVersion(installDir: string): Promise<string> {
	try {
		const cmd = path.join(installDir, correctBinname("ntt"))
		var { stdout } = await exec(cmd + " version");
		let sv = semver.coerce(stdout);
		if (sv) {
			return sv.version
		}
	} catch (error) {
		return "0.0.0"
	}
	return "0.0.0"
}

async function getLatestVersion(): Promise<{ version: string, asset: GitHubReleasesAPIAsset }> {
	const url = 'https://ttcn3.dev/api/v1/ntt/releases/latest';
	const response = await fetch(url);
	const data = await response.data;
	if (!response.headers['content-type']?.includes('application/json')) {
		throw new Error(`Unexpected response from ${url}:\n${response.headers}\n\n${data}`);
	}
	const releaseInfo = data as GitHubReleasesAPIResponse;
	const sv = semver.coerce(releaseInfo.tag_name);
	const serverAsset = releaseInfo.assets.find(asset => asset.name === assetName());
	if (!serverAsset) {
		throw new Error(`Missing asset URL from ${url}: ${assetName()}`);
	}
	if (!sv) {
		throw new Error(`Invalid version format from ${url}: ${releaseInfo.tag_name}`);
	}
	return { version: sv.version, asset: serverAsset };
}

async function showUpdateDialog(msg: string, details: string): Promise<boolean> {
	const cancelButton: vscode.MessageItem = { title: 'Cancel', isCloseAffordance: true }
	const installButton: vscode.MessageItem = { title: 'Install', isCloseAffordance: false }
	const selected = await vscode.window.showInformationMessage(msg, { modal: true, detail: details }, installButton, cancelButton);
	return selected === installButton;
}

export async function activateLanguageServer(context: vscode.ExtensionContext, status: Status, conf: vscode.WorkspaceConfiguration) {

	outputChannel.appendLine('Activating TTCN-3 Language Server...');

	const installDir = path.join(context.extensionPath, "servers");
	if (conf.get('server.update')) {

		// Get local version
		const installedVersion = await getInstalledVersion(installDir);
		try {
			outputChannel.appendLine(`Checking for updates...`);
			const { version: latestVersion, asset: serverAsset } = await getLatestVersion();
			const msg = `A new ttcn-3 language server release is available: ${latestVersion}. Install now?`;
			const details = `The language Server enhances the ttcn-3 experience with\ncode navigation, coloring, code completion and more.\nCancel leaves you with the already installed version of the language server: ${installedVersion}`;
			if (semver.gt(latestVersion, installedVersion) && await showUpdateDialog(msg, details)) {

				if (!(await fsExists(installDir))) {
					await fs.promises.mkdir(installDir, { recursive: true });
				}

				const url = serverAsset.browser_download_url;
				outputChannel.appendLine(`Downloading ${url}...`);
				const response = await fetch(url, {
					responseType: 'stream',
					onDownloadProgress: (progressEvent: any) => {
						const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
						status.update(`$(sync~spin) Downloading ${assetName()} ${latestVersion} :: ${percent.toFixed(2)} %`);
					}
				});

				const downloadDest = path.join(installDir, `download-${assetName()}`);
				const writer = fs.createWriteStream(downloadDest);
				response.data.pipe(writer);
				await new Promise((resolve, reject) => {
					writer.on('finish', resolve);
					writer.on('error', reject);
				});

				status.update(`$(sync~spin) Unpacking...`);
				await decompress(downloadDest, installDir, {
					filter: (file: any) => path.basename(file.path) == correctBinname("ntt")
				});
				await fs.promises.unlink(downloadDest);
				if (isOSUnixoid()) {
					child_process.exec(`chmod +x ${installDir}/ntt`);
				}
				status.update(`$(check) Installed ${latestVersion}`);
			}
		} catch (error) {
			status.update(`$(error) Could not update TTCN-3 Language Server`);
			outputChannel.appendLine(`Could not update TTCN-3 Language Server: ${error}`);
			vscode.window.showWarningMessage(`Could not update/download TTCN-3 Language Server. See output channel for details.`);
		}
	}

	const ntt = await findNttExecutable(installDir);
	let toolsPath: string = "";
	let separator: string;
	if (getOs() === 'windows') {
		separator = ';';
	} else {
		separator = ':';
	}
	let pathList: string[] | undefined = conf.get('server.toolsPath');
	var libraryList: string[] = new Array();
	let libraryPath: string = "";
	if (pathList) {
		if (getOs() != 'windows') {
			pathList.forEach(element => {
				libraryList.push(element + '/../lib64');
				libraryList.push(element + '/../lib');
			});
			libraryPath = libraryList.join(separator);
			libraryPath = libraryPath + separator + process.env['LD_LIBRARY_PATH']!;
		}
		toolsPath = pathList.join(separator);
		if (toolsPath.length > 0) {
			toolsPath = toolsPath + separator + process.env['PATH']!;
		} else {
			toolsPath = process.env['PATH']!;
		}
	}
	outputChannel.appendLine('toolsPath: ' + toolsPath);
	let serverOptions: ServerOptions = {
		run: { command: ntt, args: ['langserver'], options: { env: process.env } },
		debug: { command: ntt, args: ['langserver'], options: { env: process.env } }
	};
	if (serverOptions.debug.options) {
		serverOptions.debug.options.env['PATH'] = toolsPath;
		if (libraryPath.length > 0) {
			serverOptions.debug.options.env['LD_LIBRARY_PATH'] = libraryPath;
		}
	}
	if (serverOptions.run.options) {
		serverOptions.run.options.env['PATH'] = toolsPath;
		if (libraryPath.length > 0) {
			serverOptions.run.options.env['LD_LIBRARY_PATH'] = libraryPath;
		}
	}

	let clientOptions: LanguageClientOptions = {
		documentSelector: ['ttcn3'],
		outputChannel: outputChannel
	};

	client = new LanguageClient('ttcn3', 'TTCN-3 Language Server', serverOptions, clientOptions);
	try {
		await client.start();
		status.update('TTCN-3 Language Server running');
	} catch (e:any) {
		vscode.window.showInformationMessage('Could not start the TTCN-3 Language Server:', e);
		if (e instanceof Error) {
			vscode.window.showInformationMessage('Could not start the TTCN-3 Language Server:', e.message);
		} else if (typeof e === 'string') {
			vscode.window.showInformationMessage('Could not start the TTCN-3 Language Server:', e);
		} else {
			vscode.window.showInformationMessage('Could not start the TTCN-3 Language Server: unknown error');
		}
		return;
	}


	context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.restart", async () => {
		await client.stop();

		outputChannel.appendLine("");
		outputChannel.appendLine(" === Language Server Restart ===");
		outputChannel.appendLine("");

		await client.start();
	}));

	context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.status", async () => {
		const params: ExecuteCommandParams = { command: "ntt.status", arguments: [] };
		await client.sendRequest(ExecuteCommandRequest.type, params);
	}));

	context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.debug.toggle", async () => {
		const params: ExecuteCommandParams = { command: "ntt.debug.toggle", arguments: [] };
		await client.sendRequest(ExecuteCommandRequest.type, params);
	}));

	context.subscriptions.push(vscode.commands.registerCommand("ntt.test", async (args) => {
		const params: ExecuteCommandParams = { command: "ntt.test", arguments: [args] };
		await client.sendRequest(ExecuteCommandRequest.type, params);
	}));
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
			// react on any configuration change.
			// Let the server decide what is usefull
			const params: DidChangeConfigurationParams = { settings: undefined };
			client.sendNotification(DidChangeConfigurationNotification.type, params);
		}));
}

async function findNttExecutable(installDir: string): Promise<string> {
	let ntt = correctBinname("ntt");
	let nttPath = path.join(installDir, ntt);

	// Try installed binary
	if (fs.existsSync(nttPath)) {
		return nttPath;
	}

	// Then search PATH parts
	if (process.env['PATH']) {
		outputChannel.append("Looking for ntt in PATH...");

		let pathparts = process.env['PATH'].split(path.delimiter);
		for (let i = 0; i < pathparts.length; i++) {
			let binpath = path.join(pathparts[i], ntt);
			if (fs.existsSync(binpath)) {
				outputChannel.appendLine(binpath);
				return binpath;
			}
		}
		outputChannel.appendLine("");
	}

	let p = process.env['PATH'];
	outputChannel.appendLine(`Could not find ntt in ${p}, will try using binary name directly`);
	return ntt;
}

function assetName(): string {
	const os = getOs();
	const arch = getArch();
	return `ntt_${os}_${arch}.tar.gz`;
}

function getOs(): string {
	let platform = process.platform.toString();
	if (platform === 'win32') {
		return 'windows';
	}
	return platform;
}

function getArch(): string {
	let arch = process.arch;

	if (arch === 'ia32') {
		return 'i386';
	}
	if (arch === 'x64') {
		return 'x86_64';
	}
	if (arch === 'arm64' && process.platform.toString() === 'darwin') {
		// On Apple Silicon, install the amd64 version and rely on Rosetta2
		// until a native build is available.
		return 'x86_64';
	}
	return arch;
}
export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

function fetch<T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R> {
	// Axios has an issue with HTTPS requests over HTTP proxies. A custom
	// agent circumvents this issue.
	const agent = new ProxyAgent()
	if (!config) {
		config = {}
	}
	config.httpAgent = agent;
	config.httpsAgent = agent;
	config.proxy = false;

	// Some common headers
	if (!config.headers) {
		config.headers = {}
	}
	config.headers["User-Agent"] = "vscode-ttcn3-ide";
	config.headers["Cache-Control"] = "no-cache";
	config.headers["Pragma"] = "no-cache";
	return axios.get(url, config);
}

export interface GitHubReleasesAPIResponse {
	url: string;
	assets_url: string;
	upload_url: string;
	html_url: string;
	id: number;
	node_id: string;
	tag_name: string;
	target_commitish: string;
	name: string;
	draft: boolean;
	author: GitHubReleasesAPIAuthor;
	prerelease: boolean;
	created_at: string;
	published_at: string;
	assets: GitHubReleasesAPIAsset[];
	tarball_url: string;
	zipball_url: string;
	body: any | null;
}

export interface GitHubReleasesAPIAuthor {
	login: string;
	id: number;
	node_id: string;
	gravatar_id: string;
	url: string;
	html_url: string;
	followers_url: string;
	following_url: string;
	gists_url: string;
	starred_url: string;
	subscriptions_url: string;
	organizations_url: string;
	repos_url: string;
	events_url: string;
	received_events_url: string;
	type: string;
	site_admin: boolean;
}

export interface GitHubReleasesAPIAsset {
	url: string;
	id: number;
	node_id: string;
	name: string;
	label: string;
	uploader: GitHubReleasesAPIAuthor;
	content_type: string;
	state: string;
	size: number;
	download_count: number;
	created_at: string;
	updated_at: string;
	browser_download_url: string;
}

export async function fsExists(path: fs.PathLike): Promise<boolean> {
	try {
		await fs.promises.access(path);
		return true;
	} catch {
		return false;
	}
}
export enum LogLevel {
	NONE = 100,
	ERROR = 2,
	WARN = 1,
	INFO = 0,
	DEBUG = -1,
	TRACE = -2,
	DEEP_TRACE = -3
}

export class Logger {
	level: LogLevel;

	public constructor(level: LogLevel) {
		this.level = level;
	}

	private format(msg: String, placeholders: any[]): string {
		let result = "";
		let i = 0;
		let placeholderIndex = 0;
		while (i < msg.length) {
			let c = msg.charAt(i);
			let next = msg.charAt(i + 1);
			if (c === '{' && next === '}') {
				result += placeholders[placeholderIndex];
				placeholderIndex++;
				i += 2;
			} else {
				result += c;
				i++;
			}
		}
		return result;
	}

	private log(prefix: String, level: LogLevel, msg: String, placeholders: any[]): void {
		if (level >= this.level) {
			console.log(prefix + this.format(msg, placeholders));
		}
	}

	public error(msg: String, ...placeholders: any[]): void { this.log("Extension: [ERROR]  ", LogLevel.ERROR, msg, placeholders); }

	public warn(msg: String, ...placeholders: any[]): void { this.log("Extension: [WARN]   ", LogLevel.WARN, msg, placeholders); }

	public info(msg: String, ...placeholders: any[]): void { this.log("Extension: [INFO]   ", LogLevel.INFO, msg, placeholders); }

	public debug(msg: String, ...placeholders: any[]): void { this.log("Extension: [DEBUG]  ", LogLevel.DEBUG, msg, placeholders); }

	public trace(msg: String, ...placeholders: any[]): void { this.log("Extension: [TRACE]  ", LogLevel.TRACE, msg, placeholders); }

	public deepTrace(msg: String, ...placeholders: any[]): void { this.log("Extension: [D_TRACE]", LogLevel.DEEP_TRACE, msg, placeholders); }
}

export function isOSUnixoid(): boolean {
	let platform = process.platform;
	return platform === "linux"
		|| platform === "darwin"
		|| platform === "freebsd"
		|| platform === "openbsd";
}

export function correctBinname(binname: string): string {
	return binname + ((process.platform === 'win32') ? '.exe' : '');
}

export function exec(cmd: string): Promise<{ stdout: string, stderr: string }> {
	return new Promise((resolve, reject) => {
		child_process.exec(cmd, (err: any, stdout: any, stderr: any) => {
			if (err) {
				return reject(err);
			}
			return resolve({ stdout, stderr });
		});
	});
}


export interface Status {
	/** Updates the message. */
	update(msg: string): void;
}

/**
 * Encapsulates a status bar item.
 */
export class StatusBarEntry implements Status {
	private barItem: vscode.StatusBarItem;
	private prefix?: string;

	constructor(context: vscode.ExtensionContext, prefix?: string) {
		this.prefix = prefix;
		this.barItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
		context.subscriptions.push(this.barItem);
	}

	show(): void {
		this.barItem.show();
	}

	update(msg: string): void {
		this.barItem.text = `${this.prefix} ${msg}`;
	}

	dispose(): void {
		this.barItem.dispose();
	}
}
