
const https = require('https');

function checkSite(siteUrl) {
    console.log(`Checking ${siteUrl}...`);
    const req = https.get(siteUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    }, (res) => {
        console.log(`${siteUrl} Status: ${res.statusCode}`);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log(`${siteUrl} Body Length: ${data.length}`);
            if (res.statusCode === 200) {
                // Check for video markers
                if (siteUrl.includes('xvideos')) {
                    const count = (data.match(/id="video_/g) || []).length;
                    console.log(`XVideos video matches: ${count}`);
                }
                if (siteUrl.includes('spankbang')) {
                    const count = (data.match(/class="video-item"/g) || []).length;
                    console.log(`Spankbang video matches: ${count}`);
                }
            }
        });
    });
    
    req.on('error', (e) => {
        console.error(`${siteUrl} Error: ${e.message}`);
    });
}

checkSite('https://www.xvideos.com/?k=indian+desi');
checkSite('https://spankbang.com/s/desi/');
