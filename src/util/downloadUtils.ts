import axios from "axios";
import * as fs from "fs";

// Function to download a file with progress tracking
export function download(srcUrl: string, destPath: fs.PathLike, progress: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        axios({
            method: 'get',
            url: srcUrl,
            responseType: 'stream',
            onDownloadProgress: (progressEvent: any) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                progress(percentCompleted);
            }
        })
        .then(response => {
            const writer = fs.createWriteStream(destPath);
            response.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        })
        .catch(reject);
    });
}
