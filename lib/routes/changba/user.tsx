import { load } from 'cheerio';
import CryptoJS from 'crypto-js';
import { renderToString } from 'hono/jsx/dom/server';

import type { Route, DataItem, Data } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { PRESETS } from '@/utils/header-generator';
import { parseDate } from '@/utils/parse-date';

const decryptUrl = (enText: string) => {
    const key = CryptoJS.enc.Utf8.parse('v648672461426416');
    const iv = CryptoJS.enc.Utf8.parse('1024204840968192');
    const decrypt = CryptoJS.AES.decrypt(enText, key, {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
    });
    return decrypt.toString(CryptoJS.enc.Utf8);
};

export const route: Route = {
    path: '/:userid',
    categories: ['social-media'],
    view: ViewType.Audios,
    example: '/changba/skp6hhF59n48R-UpqO3izw',
    parameters: { userid: '用户ID, 可在对应分享页面的 URL 中找到' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: true,
        supportScihub: false,
    },
    radar: [
        {
            source: ['changba.com/s/:userid'],
            target: '/:userid',
        },
    ],
    name: '用户',
    maintainers: ['kt286', 'xizeyoupan', 'pseudoyu'],
    handler,
};

async function handler(ctx): Promise<Data> {
    const userid = ctx.req.param('userid');
    const url = `https://changba.com/wap/index.php?s=${userid}`;

    const response = await got({
        method: 'get',
        url,
        headers: {
            Referer: 'https://changba.com/',
        },
        headerGeneratorOptions: PRESETS.MODERN_IOS,
    });

    const $ = load(response.data);
    const list = $('.user-work .work-info').toArray();
    const author = $('div.user-main-info > span.txt-info > a.uname').text();
    const authorimg = $('div.user-main-info > .poster > img').attr('data-src');

    const items = await Promise.all(
        list.map((item) => {
            const $item = load(item);
            const link = $item('a').attr('href') || '';
            const absoluteLink = link.startsWith('http') ? link : `https://changba.com${link}`;

            return cache.tryGet(absoluteLink, async () => {
                const result = await got({
                    method: 'get',
                    url: absoluteLink,
                    headers: {
                        Referer: url,
                    },
                    headerGeneratorOptions: PRESETS.MODERN_IOS,
                });

                const enWorkUrlMatch = result.data.match(/workurl:\s*["'](.+?)["']/);
                if (!enWorkUrlMatch) {
                    return {};
                }

                const mp3 = decryptUrl(enWorkUrlMatch[1]);
                const $detail = load(result.data);
                const timeText = $detail('.work-info .time').text();

                const dataItem: DataItem = {
                    title: $detail('.work-title').text(),
                    description: renderToString(<ChangbaWorkDescription desc={$detail('div.des').text()} mp3url={mp3} />),
                    link: absoluteLink,
                    author,
                    enclosure_url: mp3,
                    enclosure_type: 'audio/mpeg',
                    pubDate: timeText ? parseDate(timeText) : undefined,
                };
                return dataItem;
            }) as Promise<DataItem>;
        })
    );

    return {
        title: `${author} - 唱吧`,
        link: url,
        description: $('meta[name="description"]').attr('content') || `${author} - 唱吧`,
        item: items.filter((i): i is DataItem => i && Object.keys(i).length > 0),
        image: authorimg,
        itunes_author: author,
        itunes_category: '唱吧',
    };
}

function ChangbaWorkDescription({ desc, mp3url }: { desc: string; mp3url: string }) {
    return (
        <>
            <p>{desc}</p>
            <audio src={mp3url} controls preload="metadata" referrerPolicy="no-referrer"></audio>
        </>
    );
}
