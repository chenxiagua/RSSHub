import { load } from 'cheerio';
import CryptoJS from 'crypto-js';
import { renderToString } from 'hono/jsx/dom/server';

import type { Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { PRESETS } from '@/utils/header-generator';
const AES_KEY = 'a17fe74e421c2cbf3dc323f4b4f3a1af';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const route: Route = {
    path: '/:userid',
    categories: ['social-media'],
    view: ViewType.Audios,
    example: '/changba/skp6hhF59n48R-UpqO3izw',
    parameters: { userid: '用户ID, 可在对应分享页面的 URL 中找到' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: true,
        supportScihub: false,
    },
    radar: [
        {
            source: ['changba.com/s/:userid'],
        },
    ],
    name: '用户',
    maintainers: ['kt286', 'xizeyoupan', 'pseudoyu'],
    handler,
};

async function handler(ctx) {
    const userid = ctx.req.param('userid');
    const url = `https://changba.com/wap/index.php?s=${userid}`;
    const response = await got({
        method: 'get',
        url,
        headers,
    });

    const $ = load(response.data);
    const list = $('.user-work .work-info').toArray();
    const author = $('div.user-main-info > span.txt-info > a.uname').text();
    const authorimg = $('div.user-main-info > .poster > img').attr('data-src');

    const items: any[] = [];

    for (const item of list) {
        const item$ = load(item);
        const link = item$('a').attr('href');

        if (!link) continue;

        const cachedItem = await cache.tryGet(link, async () => {
            await wait(500 + Math.random() * 1000);

            const result = await got({
                method: 'get',
                url: link,
                headers,
            });

            const match = result.data.match(/\benc_workpath\b\s*:\s*['"]([^'"]+)['"]/);

            if (!match) {
                return null;
            }
            const iv = CryptoJS.enc.Utf8.parse(AES_KEY.slice(0, 16));
            const key = CryptoJS.enc.Utf8.parse(AES_KEY.slice(16));
            const decrypted = CryptoJS.AES.decrypt(match[1], key, { iv, padding: CryptoJS.pad.Pkcs7 });
            const mp3Url = decrypted.toString(CryptoJS.enc.Utf8);

            if (!mp3Url) {
                return null;
            }

            const mp3 = mp3Url.replace('http://', 'https://');
            const description = renderToString(<ChangbaWorkDescription desc={item$('div.des').text()} mp3url={mp3} />);
            const styleAttr = item$('div.work-cover').attr('style') || '';
            const itunes_item_image = styleAttr.match(/url\(['"]?(.*?)['"]?\)/)?.[1];

            return {
                title: item$('.work-title').text(),
                description,
                link,
                author,
                itunes_item_image,
                enclosure_url: mp3,
                enclosure_type: 'audio/mpeg',
            };
        });

        if (cachedItem) {
            items.push(cachedItem);
        }
    }

    return {
        title: `${author} - 唱吧`,
        link: url,
        description: $('meta[name="description"]').attr('content') || `${author} - 唱吧`,
        item: items,
        image: authorimg,
        itunes_author: author,
        itunes_category: '唱吧',
    };
}

const ChangbaWorkDescription = ({ desc, mp3url }: { desc: string; mp3url: string }) => (
    <>
        <p>{desc}</p>
        <audio id="audio" src={mp3url} preload="metadata" controls></audio>
    </>
);
