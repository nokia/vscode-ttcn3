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
	//testExecOutChannel = vscode.window.createOutputChannel("TTCN-3-Test");
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

export async function activateLanguageServer(context: vscode.ExtensionContext, status: Status, conf: vscode.WorkspaceConfiguration) {

	outputChannel.appendLine('Activating TTCN-3 Language Server...');
	status.update('Activating Activating TTCN-3 Language Server...');

	const installDir = path.join(context.extensionPath, "servers");
	const nttDownloader = new ServerDownloader("TTCN-3 Language Server", "ntt", assetName(), installDir, outputChannel);

	if (conf.get('server.update')) {
		try {
			await nttDownloader.downloadServerIfNeeded(status);
			// Ensure that start script can be executed
			if (isOSUnixoid()) {
				child_process.exec(`chmod +x ${installDir}/ntt`);
			}
		} catch (error) {
			console.error(error);
			vscode.window.showWarningMessage(`Could not update/download TTCN-3 Language Server: ${error}`);
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

	// Create the language client and start the client.
	status.update(`Initializing TTCN-3 Language Server...`);
	client = new LanguageClient('ttcn3', 'TTCN-3 Language Server', serverOptions, clientOptions);
	try {
		await client.start();
	} catch (e) {
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


export class ServerDownloader {
	private displayName: string;
	private githubProjectName: string;
	private assetName: string;
	private installDir: string;
	outputChannel: vscode.OutputChannel

	constructor(displayName: string, githubProjectName: string, assetName: string, installDir: string, outputChannel: vscode.OutputChannel) {
		this.displayName = displayName;
		this.githubProjectName = githubProjectName;
		this.installDir = installDir;
		this.assetName = assetName;
		this.outputChannel = outputChannel;
	}

	private async latestReleaseInfo(): Promise<GitHubReleasesAPIResponse> {
		const response = await fetch(`https://ttcn3.dev/api/v1/ntt/releases/latest`);
		if (!response.headers['content-type']?.includes('application/json')) {
			throw new Error(`Unexpected content type: ${response.headers['content-type']}`);
		}
		const data = await response.data;
		return data as GitHubReleasesAPIResponse;
	}

	private async downloadServer(downloadUrl: string, version: string, status: Status): Promise<void> {
		if (!(await fsExists(this.installDir))) {
			await fs.promises.mkdir(this.installDir, { recursive: true });
		}

		const downloadDest = path.join(this.installDir, `download-${this.assetName}`);
		status.update(`Downloading ${this.displayName} ${version}...`);
		this.outputChannel.append(`Downloading ${this.displayName} ${version}...`);

		const response = await fetch(downloadUrl, {
			responseType: 'stream',
			onDownloadProgress: (progressEvent: any) => {
				const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
				status.update(`Downloading ${this.displayName} ${version} :: ${percent.toFixed(2)} %`);
			}
		});

	        const writer = fs.createWriteStream(downloadDest);
		response.data.pipe(writer);
		await new Promise((resolve, reject) => {
				writer.on('finish', resolve);
				writer.on('error', reject);
		});

		status.update(`Unpacking ${this.displayName} ${version}...`);
		await decompress(downloadDest, this.installDir, {
			filter: (file: any) => path.basename(file.path) == correctBinname("ntt")
		});
		await fs.promises.unlink(downloadDest);

		this.outputChannel.appendLine(`done`)
		status.update(`Initializing ${this.displayName}...`);
	}


	async downloadServerIfNeeded(status: Status): Promise<void> {

		var installedVersion = "0.0.0";
		try {
			const cmd = path.join(this.installDir, correctBinname("ntt"))
			var { stdout } = await exec(cmd + " version");
			let sv = semver.coerce(stdout);
			if (sv) {
				installedVersion = sv.version
			}
		} catch (err) { }

		this.outputChannel.appendLine(`Installed ${this.displayName} version: ${installedVersion}`)
		this.outputChannel.append(`Checking ttcn3.dev for the latest release...`)
		let releaseInfo: GitHubReleasesAPIResponse;

		try {
			releaseInfo = await this.latestReleaseInfo();
		} catch (error) {
			const message = `Unable to fetch latest release: ${error}.`;
			if (installedVersion == "0.0.0") {
				// No server is installed yet, so throw
				throw new Error(message);
			} else {
				// Do not throw since user might just be offline
				// and a version of the server is already installed
				LOG.warn(message);
				return;
			}
		}

		let sv = semver.coerce(releaseInfo.tag_name);
		var latestVersion = "0.0.0";
		if (sv) {
			latestVersion = sv.version
			this.outputChannel.appendLine(`found version ${latestVersion}`)
		} else {
			this.outputChannel.appendLine(`not available`)
		}

		if (semver.gt(latestVersion, installedVersion)) {
			const cancelButton: vscode.MessageItem = { title: 'Cancel', isCloseAffordance: true }
			const installButton: vscode.MessageItem = { title: 'Install', isCloseAffordance: false }
			const selected = await vscode.window.showInformationMessage(`vscode-ttcn3: A new ttcn-3 language server release is available: ${latestVersion}. Install now?`,
				{ modal: true, detail: `The language Server enhances the ttcn-3 experience with\ncode navigation, coloring, code completion and more.\nCancel leaves you with the already installed version of the language server: ${installedVersion}` },
				installButton, cancelButton);
			if (selected === cancelButton) {
				return;
			}
			const serverAsset = releaseInfo.assets.find(asset => asset.name === this.assetName);
			if (serverAsset) {
				const downloadUrl = serverAsset.browser_download_url;
				await this.downloadServer(downloadUrl, latestVersion, status);
			} else {
				throw new Error(`Latest GitHub release for ${this.githubProjectName} does not contain the asset '${this.assetName}'!`);
			}
		}
	}
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

export const LOG = new Logger(LogLevel.INFO);

export function isOSWindows(): boolean {
    return process.platform === "win32";
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
		child_process.exec(cmd, (err:any, stdout:any, stderr:any) => {
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
