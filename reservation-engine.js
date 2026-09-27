const { chromium } = require("playwright");
const fs = require("fs");

function validateProductUrl(productUrl) {
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

  return url;
}

async function main() {
  const productUrl = process.env.PRODUCT_URL;

  validateProductUrl(productUrl);

  console.log("========================================");
  console.log("Fishingmax 商品ページ情報取得テスト");
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
    console.log("");

    const response = await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.waitForTimeout(3000);

    const httpStatus = response ? response.status() : null;
    const pageTitle = await page.title();
    const currentUrl = page.url();

    console.log("---------- 基本情報 ----------");
    console.log(`HTTPステータス: ${httpStatus}`);
    console.log(`ページタイトル: ${pageTitle}`);
    console.log(`現在のURL: ${currentUrl}`);
    console.log("");

    const bodyText = await page.locator("body").innerText();

    console.log("---------- ページ本文 ----------");
    console.log(bodyText.substring(0, 5000));
    console.log("");

    const links = await page.getByRole("link").allInnerTexts();
    const buttons = await page.getByRole("button").allInnerTexts();

    const inputs = await page.locator("input").count();
    const selects = await page.locator("select").count();
    const textareas = await page.locator("textarea").count();

    console.log("---------- ページ構成 ----------");
    console.log(`リンク数: ${links.length}`);
    console.log(`ボタン数: ${buttons.length}`);
    console.log(`入力欄数: ${inputs}`);
    console.log(`選択欄数: ${selects}`);
    console.log(`テキストエリア数: ${textareas}`);
    console.log("");

    console.log("---------- ボタン ----------");

    if (buttons.length === 0) {
      console.log("ボタンは検出されませんでした。");
    } else {
      buttons.forEach((button, index) => {
        console.log(`${index + 1}. ${button}`);
      });
    }

    console.log("");

    console.log("---------- 主要リンク ----------");

    const limitedLinks = links.slice(0, 50);

    if (limitedLinks.length === 0) {
      console.log("リンクは検出されませんでした。");
    } else {
      limitedLinks.forEach((link, index) => {
        console.log(`${index + 1}. ${link}`);
      });
    }

    console.log("");

    const report = {
      testType: "Fishingmax商品ページ情報取得テスト",
      checkedAt: new Date().toISOString(),
      productUrl: productUrl,
      httpStatus: httpStatus,
      pageTitle: pageTitle,
      currentUrl: currentUrl,
      elementCounts: {
        links: links.length,
        buttons: buttons.length,
        inputs: inputs,
        selects: selects,
        textareas: textareas
      },
      buttons: buttons,
      links: limitedLinks,
      bodyTextPreview: bodyText.substring(0, 10000)
    };

    fs.writeFileSync(
      "fishingmax-page-report.json",
      JSON.stringify(report, null, 2),
      "utf8"
    );

    fs.writeFileSync(
      "fishingmax-page-text.txt",
      bodyText,
      "utf8"
    );

    await page.screenshot({
      path: "fishingmax-page.png",
      fullPage: true
    });

    console.log("---------- 保存ファイル ----------");
    console.log("fishingmax-page-report.json");
    console.log("fishingmax-page-text.txt");
    console.log("fishingmax-page.png");
    console.log("");

    console.log("========================================");
    console.log("商品ページ情報取得テスト完了");
    console.log("========================================");
    console.log("");
    console.log("今回はページの読み取りのみを行いました。");
    console.log("購入・カート投入・注文確定操作は実行していません。");

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
  console.error("");
  process.exit(1);
});
