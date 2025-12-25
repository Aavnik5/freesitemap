
const https = require('https');

const url = 'https://www.xvideos.com/?k=indian+desi';

https.get(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
}, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        
        // Test Regex
        const blockRegex = /<div[^>]+id="video_\d+"[^>]+class="thumb-block[^"]*"[^>]*>([\s\S]*?)<\/div\s*>\s*<\/div>/gi;
        let match;
        let count = 0;
        
        // Just print first 500 chars to check if we got HTML
        console.log('Snippet:', data.substring(0, 500));

        while ((match = blockRegex.exec(data)) !== null) {
            count++;
            const block = match[1];
            // console.log('Block found:', block.substring(0, 100)); // Debug block

            const linkMatch = block.match(/<p class="title"><a href="([^"]+)"[^>]+title="([^"]+)">/i);
            const imgMatch = block.match(/data-src="([^"]+)"/i);
            
            if (linkMatch && imgMatch) {
                console.log('Video Found:', linkMatch[2]);
            } else {
                console.log('Block match but extraction failed');
            }
            if(count > 2) break; 
        }
        
        console.log('Total matches:', count);
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
