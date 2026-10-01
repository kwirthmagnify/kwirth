import { URL } from 'url';
import * as cheerio from 'cheerio';

// Configuración inicial
const START_URL = 'https://kwirthmagnify.dev/documentation/'; // Cambia esto por tu web
const MAX_CONCURRENT = 5; // Límite de peticiones simultáneas para no saturar

const visited = new Set();
const brokenLinks = new Set();
const checkedUrls = new Map(); // Guarda el status HTTP para no repetir comprobaciones

async function checkLink(url) {
    if (checkedUrls.has(url)) return checkedUrls.get(url);

    try {
        const response = await fetch(url, { 
            method: 'HEAD',
            headers: { 'User-Agent': 'NodeJS-LinkChecker/1.0' }
        });
        
        // Si HEAD no está permitido, intentamos con GET
        if (response.status === 405 || response.status === 403) {
            const getRes = await fetch(url, { 
                method: 'GET',
                headers: { 'User-Agent': 'NodeJS-LinkChecker/1.0' }
            });
            checkedUrls.set(url, getRes.status);
            return getRes.status;
        }

        checkedUrls.set(url, response.status);
        return response.status;
    } catch (error) {
        checkedUrls.set(url, 'ERROR');
        return 'ERROR';
    }
}

async function crawl(startUrl) {
    const baseUrl = new URL(startUrl);
    const queue = [baseUrl.href];

    console.log(` Iniciando rastreo en: ${startUrl}\n`);

    while (queue.length > 0) {
        // Sacamos un lote de URLs para procesar en paralelo
        const batch = queue.splice(0, MAX_CONCURRENT);
        const promises = batch.map(async (currentUrl) => {
            if (visited.has(currentUrl)) return;
            visited.add(currentUrl);

            console.log(`Analizando: ${currentUrl}`);

            try {
                const response = await fetch(currentUrl, {
                    headers: { 'User-Agent': 'NodeJS-LinkChecker/1.0' }
                });

                if (!response.ok) {
                    console.log(`❌ Enlace ROTO (Principal): ${currentUrl} [Status: ${response.status}]`);
                    brokenLinks.add(`${currentUrl} (Status: ${response.status})`);
                    return;
                }

                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('text/html')) {
                    return; // Solo analizamos HTML en busca de más enlaces
                }

                const html = await response.text();
                const $ = cheerio.load(html);
                const linksOnPage = $('a[href]');

                for (let i = 0; i < linksOnPage.length; i++) {
                    const href = $(linksOnPage[i]).attr('href');
                    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                        continue;
                    }

                    try {
                        const resolvedUrl = new URL(href, currentUrl);
                        
                        // Ignorar fragmentos (ej: #seccion) y limpiar la URL
                        resolvedUrl.hash = '';
                        const cleanUrl = resolvedUrl.href;

                        // Comprobar si es un enlace interno (mismo dominio)
                        if (resolvedUrl.hostname === baseUrl.hostname) {
                            if (!visited.has(cleanUrl) && !queue.includes(cleanUrl)) {
                                queue.push(cleanUrl);
                            }
                        } else {
                            // Si es un enlace externo, opcionalmente podemos verificar si está roto
                            const status = await checkLink(cleanUrl);
                            if (status >= 400 || status === 'ERROR') {
                                console.log(`❌ Enlace Externo Roto: ${cleanUrl} [Status: ${status}] (Desde: ${currentUrl})`);
                                brokenLinks.add(`${cleanUrl} [Externo] (Status: ${status})`);
                            }
                        }
                    } catch (e) {
                        // URL inválida
                    }
                }

            } catch (err) {
                console.log(`❌ Error al conectar con: ${currentUrl}`);
                brokenLinks.add(`${currentUrl} (Error de red)`);
            }
        });

        await Promise.all(promises);
    }

    console.log('\n==============================');
    console.log(' RASTREO FINALIZADO ');
    console.log('==============================');
    console.log(`Total de páginas analizadas: ${visited.size}`);
    console.log(`Enlaces rotos encontrados: ${brokenLinks.size}\n`);

    if (brokenLinks.size > 0) {
        console.log('Listado de enlaces rotos:');
        brokenLinks.forEach(link => console.log(` - ${link}`));
    } else {
        console.log(' ¡Excelente! No se encontraron enlaces rotos.');
    }
}

// Ejecutar
crawl(START_URL);