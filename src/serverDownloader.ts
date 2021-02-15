import * as decompress from 'decompress';
import * as vscode from 'vscode';
import * as path from "path";
import * as semver from "semver";
import * as requestPromise from "request-promise-native";
import * as fs from "fs";
import { fsExists } from "./util/fsUtils";
import { exec, correctBinname } from './util/osUtils';
import { GitHubReleasesAPIResponse } from "./githubApi";
import { LOG } from "./util/logger";
import { download } from "./util/downloadUtils";
import { Status } from "./util/status";

export class ServerDownloader {
	private displayName: string;
	private githubProjectName: string;
	private assetName: string;
	private installDir: string;

	constructor(displayName: string, githubProjectName: string, assetName: string, installDir: string) {
		this.displayName = displayName;
		this.githubProjectName = githubProjectName;
		this.installDir = installDir;
		this.assetName = assetName;
	}

	private async latestReleaseInfo(): Promise<GitHubReleasesAPIResponse> {
		const rawJson = await requestPromise.get(`https://api.github.com/repos/nokia/${this.githubProjectName}/releases/latest`, {
			headers: { "User-Agent": "vscode-ttcn3-ide" }
		});
		return JSON.parse(rawJson) as GitHubReleasesAPIResponse;
	}

	private async downloadServer(downloadUrl: string, version: string, status: Status): Promise<void> {
		if (!(await fsExists(this.installDir))) {
			await fs.promises.mkdir(this.installDir, { recursive: true });
		}

		const downloadDest = path.join(this.installDir, `download-${this.assetName}`);
		status.update(`Downloading ${this.displayName} ${version}...`);
		await download(downloadUrl, downloadDest, percent => {
			status.update(`Downloading ${this.displayName} ${version} :: ${(percent * 100).toFixed(2)} %`);
		});

		status.update(`Unpacking ${this.displayName} ${version}...`);
		await decompress(downloadDest, this.installDir, {
			    filter: (file:any) => path.basename(file.path) == 'ntt'});
		await fs.promises.unlink(downloadDest);

		status.update(`Initializing ${this.displayName}...`);
	}


	async downloadServerIfNeeded(status: Status): Promise<void> {

		var installedVersion = "0.0.0";
		try {
			const cmd = path.join(this.installDir, correctBinname("ntt"))
			var { stdout } = await exec(cmd);
			let sv = semver.coerce(stdout);
			if (sv) {
				installedVersion = sv.version
			}
		} catch (err) {}


		LOG.info(`Querying GitHub API for new ${this.displayName} version...`);

		let releaseInfo: GitHubReleasesAPIResponse;

		try {
			releaseInfo = await this.latestReleaseInfo();
		} catch (error) {
			const message = `Could not fetch from GitHub releases API: ${error}.`;
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
		}
		if (semver.gt(latestVersion, installedVersion)) {

			const selected = await vscode.window.showInformationMessage(`A new language server release is available: ${latestVersion}. Install now?`, 'Install', 'Cancel');
			if (selected === 'Cancel') {
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
