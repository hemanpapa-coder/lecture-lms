/**
 * Converts a standard Google Drive "view" or "file" link into a direct download link.
 * Format: https://drive.google.com/uc?export=download&id=FILE_ID
 */
export function getDirectDownloadUrl(url: string | null | undefined): string {
    if (!url) return '';

    // Regular expression to extract the ID from various Google Drive URL formats
    // Examples:
    // https://drive.google.com/file/d/1JvAFaLV2GWEBqkigqoEetC979rgyIJ4/view
    // https://drive.google.com/open?id=1JvAFaLV2GWEBqkigqoEetC979rgyIJ4
    const idMatch = url.match(/\/d\/(.+?)\/(view|edit)?/) || url.match(/[?&]id=(.+?)(&|$)/);

    if (idMatch && idMatch[1]) {
        const fileId = idMatch[1];
        // Return local secure proxy URL instead of a Google Drive link
        return `/api/download/${fileId}`;
    }

    // If it's already a direct link or we can't parse it, return as is
    return url;
}
