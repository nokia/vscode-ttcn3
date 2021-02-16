import * as child_process from "child_process";

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

