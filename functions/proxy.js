const fetch = require('node-fetch');
const cheerio = require('cheerio');

const TARGET_DOMAIN = 'www.quia.com';

exports.handler = async (event) => {
  try {
    let targetPath = event.path.replace('/.netlify/functions/proxy', '');
    
    if (targetPath === '' || targetPath === '/') {
      targetPath = '/pages/main.html';
    }
    
    // Build query string if present
    const queryString = event.queryStringParameters 
      ? '?' + new URLSearchParams(event.queryStringParameters).toString() 
      : '';
    
    const targetUrl = `https://${TARGET_DOMAIN}${targetPath}${queryString}`;
    console.log('Fetching:', event.httpMethod, targetUrl);
    
    // Prepare headers
    const headers = {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept': event.headers.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.5'
    };
    
    // Forward cookies
    if (event.headers.cookie) {
      headers.cookie = event.headers.cookie;
    }
    
    // Forward content-type for POST requests
    if (event.headers['content-type']) {
      headers['content-type'] = event.headers['content-type'];
    }
    
    // Prepare fetch options
    const fetchOptions = {
      method: event.httpMethod,
      headers: headers,
      redirect: 'manual'
    };
    
    // Add body for POST/PUT requests
    if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
      fetchOptions.body = event.isBase64Encoded 
        ? Buffer.from(event.body, 'base64').toString()
        : event.body;
      console.log('Request body:', fetchOptions.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    console.log('Response status:', response.status);
    
    const contentType = response.headers.get('content-type') || '';
    console.log('Content-Type:', contentType);
    
    // Handle redirects
    if (response.status >= 300 && response.status < 400) {
      let location = response.headers.get('location');
      if (location) {
        console.log('Original redirect:', location);
        if (location.startsWith('/')) {
          location = `/.netlify/functions/proxy${location}`;
        } else if (location.startsWith(`https://${TARGET_DOMAIN}`)) {
          location = location.replace(`https://${TARGET_DOMAIN}`, '/.netlify/functions/proxy');
        }
        console.log('Modified redirect:', location);
        
        // Get cookies for redirect
        const responseHeaders = {
          'location': location
        };
        
        const responseCookies = response.headers.raw()['set-cookie'];
        if (responseCookies && responseCookies.length > 0) {
          // Join multiple cookies with comma (Netlify format)
          responseHeaders['set-cookie'] = responseCookies
            .map(cookie => cookie.replace(/Domain=[^;]+/gi, '').replace(/; Secure/gi, ''))
            .join(', ');
        }
        
        return {
          statusCode: response.status,
          headers: responseHeaders,
          body: ''
        };
      }
    }
    
    // For non-HTML content, just pass through
    if (!contentType.includes('text/html')) {
      const buffer = await response.arrayBuffer();
      return {
        statusCode: response.status,
        headers: {
          'content-type': contentType
        },
        body: Buffer.from(buffer).toString('base64'),
        isBase64Encoded: true
      };
    }
    
    // Process HTML
    const body = await response.text();
    console.log('Body length:', body.length);
    
    const $ = cheerio.load(body);
    
    // Rewrite URLs
    $('a, link, script, img, form, iframe').each((i, el) => {
      const $el = $(el);
      const tagName = el.tagName.toLowerCase();
      let attr = 'href';
      
      if (tagName === 'script' || tagName === 'img' || tagName === 'iframe') {
        attr = 'src';
      } else if (tagName === 'form') {
        attr = 'action';
      }
      
      let url = $el.attr(attr);
      if (url && url.startsWith('/')) {
        $el.attr(attr, `/.netlify/functions/proxy${url}`);
      } else if (url && url.startsWith(`https://${TARGET_DOMAIN}`)) {
        $el.attr(attr, url.replace(`https://${TARGET_DOMAIN}`, '/.netlify/functions/proxy'));
      }
    });
    
    // Add tools button
    $('body').append(`
      <script>
        window.addEventListener('load', () => {
          const button = document.createElement('button');
          button.innerText = 'Activate Extra Tools';
          Object.assign(button.style, {
            position: 'fixed',
            top: '10px',
            right: '10px',
            zIndex: '9999',
            padding: '10px 15px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          });
          button.onclick = () => {
            document.querySelectorAll('.answer').forEach(el => el.style.backgroundColor = 'yellow');
            alert('Tools activated!');
          };
          document.body.appendChild(button);
        });
      </script>
    `);
    
    const modifiedBody = $.html();
    console.log('Modified body length:', modifiedBody.length);
    
    // Forward cookies from Quia
    const responseCookies = response.headers.raw()['set-cookie'];
    const responseHeaders = {
      'content-type': 'text/html; charset=utf-8'
    };
    
    if (responseCookies && responseCookies.length > 0) {
      // Join multiple cookies with comma (Netlify format)
      responseHeaders['set-cookie'] = responseCookies
        .map(cookie => cookie.replace(/Domain=[^;]+/gi, '').replace(/; Secure/gi, ''))
        .join(', ');
    }
    
    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: modifiedBody
    };
  } catch (error) {
    console.error('Error:', error);
    return { 
      statusCode: 500, 
      headers: { 'content-type': 'text/html' },
      body: `<h1>Error</h1><p>${error.message}</p><pre>${error.stack}</pre>` 
    };
  }
};
