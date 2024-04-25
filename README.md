<div align="center">
  <img src="public/icon-1024.png" height="256" width="256" alt="logo"/>
  <h1> Chrome Extension Preply Talpa</h1>
  <p>Install from <a href="https://chromewebstore.google.com/detail/preply-talpa/kaopedglfdgcdafooeggegbhdnkhcdhh">Chrome Store</a></p>
</div>

Preply Talpa is a Chrome extension for streamlining string ID identification process. No more endless scrolling or manual searching – with Preply Talpa, just hover over any string and instantly see its corresponding ID. Preply Talpa seamlessly integrates with Crowdin, helping developers, translators, and project managers alike. Spend less time searching and more time translating or managing projects effectively.

## Development
- Make sure [Bun](https://bun.sh/docs/installation) is installed, nothing else is required
- Run `bun install`
- Run `bun run dev`, extension will be built in `dist` dir and file watcher will start
- Go to `chrome://extensions/` page, click "Load unpacked" and select `dist` dir (this needs to be done only once)
- After new changes the extension will reload automatically, tab where extension is used needs to be reloaded manually. Sometimes extension reload fails and then it needs to be reloaded manually from `chrome://extensions/` page.

## Publish extension
- Make sure to update package.json version
- Run `bun run build`
- Upload `dist/chrome-extension-preply-talpa.zip` to [Chrome Store](https://chromewebstore.google.com/detail/preply-talpa/kaopedglfdgcdafooeggegbhdnkhcdhh) (currently published under artem.p@preply.com account)
