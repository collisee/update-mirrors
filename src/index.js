export default {
    async fetch(request, env) {
        try {
            const owner  = 'westandskif';
            const repo   = 'rate-mirrors';
            const filter = /x86_64/;
            const headers = {
                'Accept': 'application/json',
                'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36`,
            };
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
            const response = await fetch(apiUrl, { headers });
            if (!response.ok) {
                return new Response(
                    JSON.stringify({ error: `GitHub API responded with ${response.status}` }),
                                    { status: response.status, headers: { 'Content-Type': 'application/json' } }
                );
            }
            const release = await response.json();
            // Find the asset matching the static filter
            const asset = (release.assets || []).find(a => filter.test(a.name));
            if (!asset) {
                return new Response(JSON.stringify({
                    error: 'No asset matching the filter was found in the latest release.'
                }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            // Generate the bash script with the found URL
            const bashScript = `#!/bin/bash
URL="${asset.browser_download_url}"
CURL_OUTPUT=$(curl -s -L -OJ -w "%{filename_effective}" "$URL")
CURL_STATUS=$?

if [ $CURL_STATUS -ne 0 ] || [ -z "$CURL_OUTPUT" ]; then
    echo "Download failed or filename could not be determined."
    exit 1
fi

# Find the mirrors binary in the archive and get its path
TARGET_FILE=$(tar -tzf ""$CURL_OUTPUT"" | grep -E '[^/]*mirrors[^/]*$')
if [ -z "$TARGET_FILE" ]; then
    echo "No mirrors binary found in archive."
    exit 1
fi

# Calculate strip components needed
STRIP_COMPONENTS=$(echo "$TARGET_FILE" | tr -cd '/' | wc -c)
BINARY_NAME=$(basename "$TARGET_FILE")

# Extract with dynamic strip components
if [ $STRIP_COMPONENTS -gt 0 ]; then
    tar -xzf "$CURL_OUTPUT" --strip-components=$STRIP_COMPONENTS "$TARGET_FILE"
else
    tar -xzf "$CURL_OUTPUT" "$TARGET_FILE"
fi

rm -f "$CURL_OUTPUT"
chmod +x "$BINARY_NAME"

if [ "$(whoami)" != "root" ]; then
    sudo ./"$BINARY_NAME" --protocol https --allow-root --disable-comments --save /etc/pacman.d/mirrorlist arch
else
    ./"$BINARY_NAME" --protocol https --allow-root --disable-comments --save /etc/pacman.d/mirrorlist arch
fi

rm -f "$BINARY_NAME"
`;
                    // Return the bash script as plain text
                    return new Response(bashScript, {
                        status: 200,
                        headers: {
                            'Content-Type': 'text/plain',
                            'Content-Disposition': 'attachment; filename="update-mirrors.sh"'
                        }
                    });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};
