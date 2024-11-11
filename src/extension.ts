import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient/node';
import * as path from 'path';
import * as semver from 'semver';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as fs from 'fs';
import decompress from 'decompress';
import { ProxyAgent } from 'proxy-agent';


let client: lsp.LanguageClient;
let outputChannel: vscode.OutputChannel;
let status: vscode.StatusBarItem;
let nttPath;
let nttExecutable;

export async function activate(context: vscode.ExtensionContext) {

	vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('ttcn3')) {
			sanitizeConfiguration();
		}
	});
	sanitizeConfiguration();

	outputChannel = vscode.window.createOutputChannel('TTCN-3', { log: true });
	context.subscriptions.push(outputChannel);
	outputChannel.appendLine(`Activating TTCN-3 extension version ${context.extension.packageJSON['version']}`);

	status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	context.subscriptions.push(status);
	status.show()

	nttPath = path.join(context.extensionPath, 'servers');
	nttExecutable = path.join(nttPath, correctBinname("ntt"));

	let cmd = {
		command: nttExecutable,
		args: ['langserver'],
		options: { env: process.env }
	};

	cmd.options.env.PATH = [
		config<string[]>('ttcn3.server.toolsPath')?.join(path.delimiter),
		cmd.options.env.PATH,
	].join(path.delimiter);

	let custom = config<string | undefined>('ttcn3.server.command')?.trim()
	if (custom) {
		let args = custom.split(/\s+/).map(s => s.trim());
		cmd.command = args[0];
		cmd.args = args.slice(1);
	} else if (config('ttcn3.server.automaticUpdate')) {
		const installedVersion = await getInstalledVersion(cmd.command, { env: cmd.options.env });
		try {
			outputChannel.appendLine(`Checking for updates...`);
			const { version: latestVersion, asset: serverAsset, url: releaseNotes } = await getLatestVersion();
			outputChannel.appendLine(`Latest version: ${latestVersion}`);
			outputChannel.appendLine(`Installed version: ${installedVersion}`);
			const msg = `There is an available update for TTCN-3 language server.`;
			const details = `Do you want to update the TTCN-3 language server to version ${latestVersion}?\n\nA language Server enhances the TTCN-3 experience with code navigation, coloring, code completion and more.\n\nYou can revert to the initial version anytime by reinstalling the extension.`;
			if (semver.gt(latestVersion, installedVersion)) {
				outputChannel.appendLine(`Release notes: ${releaseNotes}`);
				if (await showUpdateDialog(msg, details)) {
					await updateServer(nttPath, serverAsset, latestVersion);
				}
			}
		} catch (error) {
			status.text = `$(error) Could not update TTCN-3 Language Server`;
			outputChannel.appendLine(`Could not update TTCN-3 Language Server: ${error}`);
			vscode.window.showWarningMessage(`Could not update/download TTCN-3 Language Server. See output channel for details.`);
			outputChannel.show();
		}
	}

	client = new lsp.LanguageClient('ttcn3', 'TTCN-3 Language Client', cmd, {
		documentSelector: ['ttcn3'],
		outputChannel: outputChannel,
	});

	try {
		outputChannel.appendLine(`Starting ${cmd.command} ${cmd.args.join(' ')}`);
		await client.start();
		const info = client.initializeResult?.serverInfo;
		if (info) {
			status.text = `${info.name} ${info.version}`;
		}
	} catch (e: any) {
		vscode.window.showInformationMessage(`Could not start the TTCN-3 Language Server: ${e}`);
		return;
	}


	context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.restart", async () => {
		await client.restart();
	}));

	context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.status", async () => {
		const params: lsp.ExecuteCommandParams = { command: "ntt.status", arguments: [] };
		await client.sendRequest(lsp.ExecuteCommandRequest.type, params);
	}));

	context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.debug.toggle", async () => {
		const params: lsp.ExecuteCommandParams = { command: "ntt.debug.toggle", arguments: [] };
		await client.sendRequest(lsp.ExecuteCommandRequest.type, params);
	}));

	context.subscriptions.push(vscode.commands.registerCommand("ntt.test", async (args) => {
		const params: lsp.ExecuteCommandParams = { command: "ntt.test", arguments: [args] };
		await client.sendRequest(lsp.ExecuteCommandRequest.type, params);
	}));

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
			// react on any configuration change.
			// Let the server decide what is usefull
			const params: lsp.DidChangeConfigurationParams = { settings: undefined };
			client.sendNotification(lsp.DidChangeConfigurationNotification.type, params);
		}));
	return;
}

function sanitizeConfiguration() {
	const update = config<boolean>('ttcn3.server.automaticUpdate');
	const cmd = config<string>('ttcn3.server.command');

	if (update && cmd) {
		vscode.workspace.getConfiguration().update('ttcn3.server.automaticUpdate', false, vscode.ConfigurationTarget.Global);
		vscode.window.showWarningMessage("Automatic updates have been disabled, because custom commands cannot be updated.");
	}
}

async function updateServer(installDir: string, serverAsset: Asset, latestVersion: string) {
	if (!(await fsExists(installDir))) {
		await fs.promises.mkdir(installDir, { recursive: true });
	}

	const url = serverAsset.browser_download_url;
	outputChannel.appendLine(`Downloading ${url}...`);
	const response = await fetch(url, {
		responseType: 'stream',
		onDownloadProgress: (progressEvent: any) => {
			const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
			status.text = `$(sync~spin) Downloading ${assetName()} ${latestVersion} :: ${percent.toFixed(2)} %`;
		}
	});

	const downloadDest = path.join(installDir, `download-${assetName()}`);
	const writer = fs.createWriteStream(downloadDest);
	response.data.pipe(writer);
	await new Promise((resolve, reject) => {
		writer.on('finish', resolve);
		writer.on('error', reject);
	});

	status.text = `$(sync~spin) Unpacking...`;
	await decompress(downloadDest, installDir, {
		filter: (file: any) => path.basename(file.path) == correctBinname("ntt")
	});
	await fs.promises.unlink(downloadDest);
	if (isOSUnixoid()) {
		child_process.exec(`chmod +x ${installDir}/ntt`);
	}
	status.text = `$(check) Installed ${latestVersion}`;
}


function getInstalledVersion(nttExecutable: string, options?: child_process.ExecSyncOptions): string {
	try {
		let stdout = child_process.execSync(`${nttExecutable} version`, options).toString().trim();
		let sv = semver.coerce(stdout);
		if (!sv) {
			return '0.0.0';
		}
		return sv.version;
	} catch (error: any) {
		return '0.0.0';
	}
}

async function getLatestVersion(): Promise<{ version: string, asset: Asset, url: string }> {
	let url = config<string | undefined>('ttcn3.server.updateServerURL')?.trim();
	if (!url) {
		url = 'https://ttcn3.dev/api/v1/ntt';
	}

	const response = await fetch(`${url}/releases`);
	const data = await response.data;
	if (!response.headers['content-type']?.includes('application/json')) {
		throw new Error(`Unexpected response from ${url}:\n${response.headers}\n\n${data}`);
	}
	const releases = data as Release[];
	const releaseInfo: Release = releases
		.filter(release => {
			return !release.prerelease || config<boolean>('ttcn3.server.usePrereleases')
		})
		.sort((latest, release) => {
			const a = semver.coerce(latest.tag_name) || '0.0.0';
			const b = semver.coerce(release.tag_name) || '0.0.0';
			if (semver.lt(a, b)) {
				return 1;
			} if (semver.gt(a, b)) {
				return -1;
			} else {
				return 0;
			}
		})[0];

	const serverAsset = releaseInfo.assets.find(asset => asset.name === assetName());
	if (!serverAsset) {
		throw new Error(`Missing asset URL from ${url}: ${assetName()}`);
	}
	return { version: releaseInfo.tag_name, asset: serverAsset, url: releaseInfo.html_url };
}

async function showUpdateDialog(msg: string, details: string): Promise<boolean> {
	const cancelButton: vscode.MessageItem = { title: 'Cancel', isCloseAffordance: true }
	const updateButton: vscode.MessageItem = { title: 'Update', isCloseAffordance: false }
	const selected = await vscode.window.showInformationMessage(msg, { modal: true, detail: details }, cancelButton, updateButton);
	return selected === updateButton;
}

function config<T>(key: string): T | undefined {
	return vscode.workspace.getConfiguration().get(key);
}

function assetName(): string {
	const assets: { [key: string]: string } = {
		'darwin,arm64': 'ntt_darwin_arm64.tar.gz',
		'darwin,x64': 'ntt_darwin_x86_64.tar.gz',
		'linux,arm64': 'ntt_linux_arm64.tar.gz',
		'linux,ia32': 'ntt_linux_i386.tar.gz',
		'linux,x64': 'ntt_linux_x86_64.tar.gz',
		'win32,x64': 'ntt_windows_x86_64.zip',
	};
	const asset = assets[`${process.platform},${process.arch}`];
	if (!asset) {
		throw new Error(`Unsupported platform ${process.platform} ${process.arch}`);
	}
	return asset;
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

function fetch<T = any, R = AxiosResponse<T>, D = any>(url: string, conf?: AxiosRequestConfig<D>): Promise<R> {
	// Axios has an issue with HTTPS requests over HTTP proxies. A custom
	// agent circumvents this issue.
	const agent = new ProxyAgent()
	if (!conf) {
		conf = {}
	}
	conf.proxy = false;
	conf.httpAgent = agent;
	conf.httpsAgent = agent;
	if (config('ttcn3.server.ignoreCertificateErrors')) {
		conf.httpsAgent.rejectUnauthorized = false;
	}

	// Some common headers
	if (!conf.headers) {
		conf.headers = {}
	}
	conf.headers["User-Agent"] = "vscode-ttcn3-ide";
	conf.headers["Cache-Control"] = "no-cache";
	conf.headers["Pragma"] = "no-cache";
	return axios.get(url, conf);
}

export interface Release {
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
	author: Author;
	prerelease: boolean;
	created_at: string;
	published_at: string;
	assets: Asset[];
	tarball_url: string;
	zipball_url: string;
	body: any | null;
}

export interface Author {
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

export interface Asset {
	url: string;
	id: number;
	node_id: string;
	name: string;
	label: string;
	uploader: Author;
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
