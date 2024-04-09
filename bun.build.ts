import { watch, rmSync, cpSync, type FSWatcher } from 'fs';
import { $ } from 'bun';
import { type BunPlugin } from 'bun';
import packageData from './package.json';

const isDev = Bun.env['__DEV__'] === 'true';
const isProd = !isDev;

const OUTPUT_DIR = 'dist/';

const extensionReloadPlugin: BunPlugin = {
    name: 'Inject extension reload',
    setup(build) {
        if (isDev) {
            // Inject extension reload code
            build.onLoad({ filter: /\/src\/background.ts$/ }, async args => {
                const backgroundText = await Bun.file(args.path).text();
                const reloadExtensionText = await Bun.file('utils/reloadExtension.ts').text();
                const contents = backgroundText.concat(reloadExtensionText);
                return {
                    contents,
                    loader: args.loader,
                };
            });
        }
    },
};

const triggerBuild = async () => {
    rmSync(OUTPUT_DIR, { force: true, recursive: true });
    cpSync('public/', OUTPUT_DIR, { recursive: true });
    const manifestFile = Bun.file('./manifest.json');
    const manifestContent = await manifestFile.json();
    delete manifestContent['$schema'];
    manifestContent.version = packageData.version;
    await Bun.write(`${OUTPUT_DIR}manifest.json`, JSON.stringify(manifestContent, null, 4));

    const build = await Bun.build({
        entrypoints: ['src/background.ts', 'src/scripts/content.ts', 'src/sidebar/index.tsx'],
        outdir: OUTPUT_DIR,
        minify: isProd,
        sourcemap: isProd ? 'inline' : 'none',
        naming: {
            entry: 'src/[dir]/[name].[ext]',
            asset: 'src/assets/[dir]/[name].[ext]',
        },
        plugins: [extensionReloadPlugin],
    });
    cpSync('src/sidebar/index.html', `${OUTPUT_DIR}src/sidebar/index.html`);
    await $`bunx tailwindcss ${isProd ? '-m' : ''} -i src/sidebar/index.css -o ./dist/src/assets/sidebar/index.css`;
    for (const output of build.outputs) {
        console.log(output.path, output.kind);
    }

    if (isProd) {
        await $`cd dist; zip -r chrome-extension-preply-talpa.zip *`;
    }
};

if (isDev) {
    const server = Bun.serve({
        port: 3591,
        fetch(req) {
            if (server.upgrade(req)) {
                return;
            }
        },
        websocket: {
            message() {
                // pass
            },
            open(ws) {
                ws.subscribe('bundle-updates');
            },
        },
    });
    console.log(`Listening on ${server.hostname}:${server.port}`);
    server.publish('bundle-updates', 'reload-extension');

    const changeDetected = (event, filename, dir) => {
        console.log(`\nDetected ${event} in ${dir}/${filename}\n`);
        triggerBuild().then(() => {
            server.publish('bundle-updates', 'reload-extension');
        });
    };

    const filesToWatch: string[] = ['src/', 'manifest.json', 'utils/'];

    const watchers: FSWatcher[] = [];

    for (const f of filesToWatch) {
        watchers.push(
            watch(`${import.meta.dir}/${f}`, { recursive: true }, (event, filename) => {
                changeDetected(event, filename, f);
            }),
        );
    }

    process.on('SIGINT', () => {
        for (const w of watchers) {
            w.close();
        }
        process.exit(0);
    });
}

triggerBuild();
