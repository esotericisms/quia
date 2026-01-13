const fetch = require('node-fetch');
const cheerio = require('cheerio');

const TARGET_DOMAIN = 'www.quia.com';

exports.handler = async (event) => {
  try {
    let targetPath = event.path.replace('/.netlify/functions/proxy', '');
    
    // If root path, load Quia's main page
    if (targetPath === '' || targetPath === '/') {
      targetPath = '/pages/main.html';
    }
    
    const targetUrl = `https://${TARGET_DOMAIN}${targetPath}`;
    console.log('Fetching:', targetUrl);
    
    const method = event.httpMethod;
    const headers = { 
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.5'
    };
    
    if (event.headers.cookie) {
      headers.cookie = event.headers.cookie;
    }

    const response = await fetch(targetUrl, {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' ? event.body : undefined,
      redirect: 'manual',
      timeout: 10000
    });

    console.log('Response status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));

    let body = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || '';
    let isBinary = !contentType.includes('text/') && !contentType.includes('application/json') && !contentType.includes('application/javascript');
    let content = isBinary ? Buffer.from(body).toString('base64') : Buffer.from(body).toString('utf-8');

    if (contentType.includes('text/html')) {
      const $ = cheerio.load(content);
      
      // Rewrite all URLs
      $('a[href], link[href], script[src], img[src], form[action], iframe[src]').each((i, el) => {
        const tagName = el.tagName.toLowerCase();
        const attr = tagName === 'form' ? 'action' : (tagName === 'iframe' || tagName === 'script' || tagName === 'img') ? 'src' : 'href';
        let url = $(el).attr(attr);
        if (url && (url.startsWith('/') || url.startsWith(`https://${TARGET_DOMAIN}`) || url.startsWith(`http://${TARGET_DOMAIN}`))) {
          url = url.replace(`https://${TARGET_DOMAIN}`, '').replace(`http://${TARGET_DOMAIN}`, '');
          if (!url.startsWith('/')) {
            url = '/' + url;
          }
          $(el).attr(attr, url);
        }
      });

      // Add the tools button
      $('body').append(`
        <script>
          window.addEventListener('load', () => {
            const button = document.createElement('button');
            button.innerText = 'Activate Extra Tools';
            button.style.position = 'fixed'; 
            button.style.top = '10px'; 
            button.style.right = '10px'; 
            button.style.zIndex = '9999';
            button.style.padding = '10px 15px';
            button.style.backgroundColor = '#4CAF50';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '5px';
            button.style.cursor = 'pointer';
            button.onclick = () => {
              document.querySelectorAll('.answer').forEach(el => el.style.backgroundColor = 'yellow');
              alert('Tools activated!');
            };
            document.body.appendChild(button);
          });
        </script>
      `);
      content = $.html();
      isBinary = false;
    }

    let respHeaders = {};
    response.headers.forEach((value, key) => {
      respHeaders[key.toLowerCase()] = value;
    });
    
    // Remove problematic headers
    delete respHeaders['content-security-policy'];
    delete respHeaders['content-security-policy-report-only'];
    delete respHeaders['strict-transport-security'];
    delete respHeaders['x-frame-options'];
    
    // Handle cookies
    if (respHeaders['set-cookie']) {
      respHeaders['set-cookie'] = respHeaders['set-cookie']
        .replace(/Domain=[^;]+/gi, '')
        .replace(/SameSite=None/gi, 'SameSite=Lax');
    }

    // Handle redirects
    const status = response.status;
    if (status >= 300 && status < 400 && respHeaders.location) {
      let location = respHeaders.location;
      location = location.replace(`https://${TARGET_DOMAIN}`, '').replace(`http://${TARGET_DOMAIN}`, '');
      if (!location.startsWith('/') && !location.startsWith('http')) {
        location = '/' + location;
      }
      respHeaders.location = location;
    }

    return {
      statusCode: status,
      headers: respHeaders,
      body: content,
      isBase64Encoded: isBinary,
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return { 
      statusCode: 500, 
      headers: { 'content-type': 'text/html' },
      body: `<h1>Proxy Error</h1><p>${error.message}</p><pre>${error.stack}</pre>` 
    };
  }
};
