import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient/node';
import * as path from 'path';
import * as semver from 'semver';
import * as fs from 'fs';
import decompress from 'decompress';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';


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


async function updateServer(
	installDir: string,
	serverAsset: Asset,
	latestVersion: string
) {
	if (!(await fsExists(installDir))) {
		await fs.promises.mkdir(installDir, { recursive: true });
	}
	const url = serverAsset.browser_download_url;
	outputChannel.appendLine(`Downloading ${url}...`);
	const downloadDest = path.join(installDir, `download-${assetName()}`);

	await downloadToFile(url, downloadDest, (loaded, total) => {
		if (total > 0) {
			const percent = Math.round((loaded * 100) / total);
			status.text = `$(sync~spin) Downloading ${assetName()} ${latestVersion} :: ${percent.toFixed(2)} %`;
		}
	});

	status.text = `$(sync~spin) Unpacking...`;
	await decompress(downloadDest, installDir, {
		filter: (file: any) => path.basename(file.path) === correctBinname("ntt"),
	});

	await fs.promises.unlink(downloadDest);

	if (isOSUnixoid()) {
		child_process.exec(`chmod +x ${path.join(installDir, "ntt")}`);
	}

	status.text = `$(check) Installed ${latestVersion}`;
}

async function downloadToFile(
	url: string,
	destPath: string,
	onProgress?: (loaded: number, total: number) => void
): Promise<void> {
	const writer = fs.createWriteStream(destPath);

	return new Promise<void>((resolve, reject) => {
		makeRequest(url, (response) => {
			const total = parseInt(response.headers['content-length'] || '0', 10);
			let loaded = 0;

			response.on('data', (chunk: Buffer) => {
				loaded += chunk.length;
				if (onProgress) {
					onProgress(loaded, total);
				}
			});

			response.pipe(writer);

			writer.on('finish', () => resolve());
			writer.on('error', reject);
		}).catch(reject);
	});
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


function makeRequest(
	url: string,
	onResponse: (response: http.IncomingMessage) => void
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const parsedUrl = new URL(url);
		const options: https.RequestOptions = {
			method: 'GET',
			headers: {
				'User-Agent': 'vscode-ttcn3-ide',
				'Cache-Control': 'no-cache',
				'Pragma': 'no-cache',
			},
		};

		// Setup proxy agents: prefer environment variables, fall back to VS Code http.proxy setting
		let proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
			process.env.HTTP_PROXY || process.env.http_proxy;
		if (!proxyUrl) {
			try {
				const vscodeProxy = vscode.workspace.getConfiguration('http').get<string>('proxy');
				if (vscodeProxy) {
					proxyUrl = vscodeProxy;
				}
			} catch (e) {
				// ignore
			}
		}

		// Respect NO_PROXY / no_proxy environment variable
		const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';
		function isNoProxy(hostname: string): boolean {
			if (!noProxy) return false;
			const parts = noProxy.split(',').map(p => p.trim()).filter(Boolean);
			for (const p of parts) {
				if (p === '*') return true;
				// domain match
				if (hostname === p) return true;
				if (p.startsWith('.')) {
					if (hostname.endsWith(p)) return true;
				}
				if (hostname.endsWith('.' + p)) return true;
			}
			return false;
		}

		if (proxyUrl && !isNoProxy(parsedUrl.hostname)) {
			if (parsedUrl.protocol === 'https:') {
				options.agent = new HttpsProxyAgent(proxyUrl);
			} else {
				options.agent = new HttpProxyAgent(proxyUrl);
			}
		}

		// Handle certificate errors if configured
		if (config('ttcn3.server.ignoreCertificateErrors')) {
			options.rejectUnauthorized = false;
		}

		const protocol = parsedUrl.protocol === 'https:' ? https : http;

		const request = protocol.request(parsedUrl, options, (response) => {
			// Handle redirects
			if (response.statusCode === 301 || response.statusCode === 302 ||
				response.statusCode === 303 || response.statusCode === 307 ||
				response.statusCode === 308) {
				const redirectUrl = response.headers.location;
				if (redirectUrl) {
					response.resume(); // Consume response to free up memory
					makeRequest(redirectUrl, onResponse).then(resolve).catch(reject);
					return;
				}
			}

			if (response.statusCode !== 200) {
				reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
				return;
			}

			onResponse(response);
			resolve();
		});

		// Set a timeout so requests don't hang behind captive/corporate proxies
		const timeoutMs = config<number>('ttcn3.server.requestTimeout') || 15000;
		request.setTimeout(timeoutMs, () => {
			request.destroy(new Error(`Request timed out after ${timeoutMs} ms`));
		});

		request.on('error', reject);
		request.end();
	});
}

async function fetch<T = any>(url: string): Promise<{ data: T; headers: http.IncomingHttpHeaders }> {
	return new Promise<{ data: T; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
		makeRequest(url, (response) => {
			let data = '';
			const headers = response.headers;

			response.on('data', (chunk) => {
				data += chunk;
			});

			response.on('end', () => {
				try {
					const parsed = JSON.parse(data);
					resolve({ data: parsed, headers });
				} catch (err) {
					reject(err);
				}
			});
		}).catch(reject);
	});
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
