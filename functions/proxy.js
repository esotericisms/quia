const fetch = require('node-fetch');
const cheerio = require('cheerio');

const TARGET_DOMAIN = 'www.quia.com';

exports.handler = async (event) => {
  try {
    let targetPath = event.path.replace('/.netlify/functions/proxy', '');
    
    if (targetPath === '' || targetPath === '/') {
      targetPath = '/pages/main.html';
    }
    
    const targetUrl = `https://${TARGET_DOMAIN}${targetPath}`;
    console.log('Fetching:', targetUrl);
    
    const response = await fetch(targetUrl, {
      headers: { 
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    console.log('Response status:', response.status);
    
    const body = await response.text();
    console.log('Body length:', body.length);
    
    // Rewrite URLs
    const $ = cheerio.load(body);
    
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
    
    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
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
