const { chromium } = require("playwright");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const productUrl = process.env.PRODUCT_URL;

  if (!productUrl) {
    throw new Error("PRODUCT_URL が指定されていません。");
  }

  let url;

  try {
    url = new URL(productUrl);
  } catch {
    throw new Error("PRODUCT_URL が正しいURLではありません。");
  }

  if (url.protocol !== "https:") {
    throw new Error("Fishingmaxの商品URLはHTTPSで指定してください。");
  }

  if (url.hostname !== "www.fishingmax-webshop.jp") {
    throw new Error(
      `許可されていないホストです: ${url.hostname}`
    );
  }

  if (!url.pathname.startsWith("/products/")) {
    throw new Error(
      "Fishingmaxの商品ページURLを指定してください。"
    );
  }

  console.log("========================================");
  console.log("Fishingmax 予約エンジン テスト");
  console.log("========================================");
  console.log("");
  console.log("対象URL:");
  console.log(productUrl);
  console.log("");

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: {
      width: 390,
      height: 844
    }
  });

  const page = await context.newPage();

  try {
    console.log("ブラウザを起動しました。");
    console.log("Fishingmaxの商品ページへアクセスします。");

    const response = await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    console.log("");

    if (response) {
      console.log(`HTTPステータス: ${response.status()}`);
    } else {
      console.log("HTTPレスポンスを取得できませんでした。");
    }

    await page.waitForTimeout(3000);

    console.log("");
    console.log("ページタイトル:");
    console.log(await page.title());

    console.log("");
    console.log("現在のURL:");
    console.log(page.url());

    console.log("");
    console.log("ページを3秒間確認しました。");

    await page.screenshot({
      path: "fishingmax-test.png",
      fullPage: true
    });

    console.log("");
    console.log("スクリーンショットを保存しました。");
    console.log("ファイル名: fishingmax-test.png");

    console.log("");
    console.log("========================================");
    console.log("ブラウザ接続テスト完了");
    console.log("========================================");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(error => {
  console.error("");
  console.error("========================================");
  console.error("エラーが発生しました");
  console.error("========================================");
  console.error(error.message);
  process.exit(1);
});
