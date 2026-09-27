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

  let browser = null;
  let context = null;
  let page = null;

  try {
    console.log("========================================");
    console.log("Fishingmax 商品ページ詳細調査テスト");
    console.log("========================================");
    console.log("");

    console.log("PRODUCT_URL:");
    console.log(productUrl || "(未指定)");
    console.log("");

    // URLチェック
    validateProductUrl(productUrl);

    console.log("URL検証: OK");
    console.log("");

    // ブラウザ起動
    console.log("Playwright Chromiumを起動します。");

    browser = await chromium.launch({
      headless: true
    });

    console.log("ブラウザ起動: OK");
    console.log("");

    // Browser Context
    context = await browser.newContext({
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      viewport: {
        width: 390,
        height: 844
      }
    });

    console.log("Browser Context作成: OK");
    console.log("");

    page = await context.newPage();

    console.log("ページ作成: OK");
    console.log("");

    // Fishingmaxへアクセス
    console.log("Fishingmaxの商品ページへアクセスします。");
    console.log(productUrl);
    console.log("");

    const response = await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    console.log("page.goto: OK");
    console.log("");

    await page.waitForTimeout(3000);

    const httpStatus = response ? response.status() : null;
    const pageTitle = await page.title();
    const currentUrl = page.url();

    console.log("---------- 基本情報 ----------");
    console.log(`HTTPステータス: ${httpStatus}`);
    console.log(`ページタイトル: ${pageTitle}`);
    console.log(`現在のURL: ${currentUrl}`);
    console.log("");

    // ============================================================
    // SELECT
    // ============================================================

    console.log("SELECT情報を取得します。");

    const selects = await page.locator("select").evaluateAll((elements) => {
      return elements.map((element, index) => ({
        index: index + 1,
        id: element.id,
        name: element.name,
        className: element.className,
        value: element.value,
        disabled: element.disabled,
        required: element.required,
        ariaLabel: element.getAttribute("aria-label"),
        options: Array.from(element.options).map((option) => ({
          text: option.textContent.trim(),
          value: option.value,
          selected: option.selected,
          disabled: option.disabled
        }))
      }));
    });

    console.log(`SELECT検出数: ${selects.length}`);
    console.log("");

    selects.forEach((select) => {
      console.log(`SELECT #${select.index}`);
      console.log(`  id: ${select.id}`);
      console.log(`  name: ${select.name}`);
      console.log(`  class: ${select.className}`);
      console.log(`  value: ${select.value}`);
      console.log(`  disabled: ${select.disabled}`);
      console.log(`  required: ${select.required}`);
      console.log(`  aria-label: ${select.ariaLabel}`);

      console.log("  options:");

      select.options.forEach((option, optionIndex) => {
        console.log(
          `    ${optionIndex + 1}. text="${option.text}" value="${option.value}" selected=${option.selected} disabled=${option.disabled}`
        );
      });

      console.log("");
    });

    // ============================================================
    // INPUT
    // ============================================================

    console.log("INPUT情報を取得します。");

    const inputs = await page.locator("input").evaluateAll((elements) => {
      return elements.map((element, index) => ({
        index: index + 1,
        type: element.type,
        id: element.id,
        name: element.name,
        className: element.className,
        value: element.value,
        placeholder: element.placeholder,
        min: element.getAttribute("min"),
        max: element.getAttribute("max"),
        step: element.getAttribute("step"),
        disabled: element.disabled,
        required: element.required,
        checked: element.checked,
        ariaLabel: element.getAttribute("aria-label")
      }));
    });

    console.log(`INPUT検出数: ${inputs.length}`);
    console.log("");

    inputs.forEach((input) => {
      console.log(`INPUT #${input.index}`);
      console.log(`  type: ${input.type}`);
      console.log(`  id: ${input.id}`);
      console.log(`  name: ${input.name}`);
      console.log(`  class: ${input.className}`);
      console.log(`  value: ${input.value}`);
      console.log(`  placeholder: ${input.placeholder}`);
      console.log(`  min: ${input.min}`);
      console.log(`  max: ${input.max}`);
      console.log(`  step: ${input.step}`);
      console.log(`  disabled: ${input.disabled}`);
      console.log(`  required: ${input.required}`);
      console.log(`  checked: ${input.checked}`);
      console.log(`  aria-label: ${input.ariaLabel}`);
      console.log("");
    });

    // ============================================================
    // BUTTON
    // ============================================================

    console.log("BUTTON情報を取得します。");

    const buttons = await page.locator("button").evaluateAll((elements) => {
      return elements.map((element, index) => ({
        index: index + 1,
        text: element.innerText.trim(),
        id: element.id,
        name: element.name,
        type: element.type,
        className: element.className,
        value: element.value,
        disabled: element.disabled,
        ariaLabel: element.getAttribute("aria-label"),
        title: element.getAttribute("title")
      }));
    });

    console.log(`BUTTON検出数: ${buttons.length}`);
    console.log("");

    buttons.forEach((button) => {
      console.log(`BUTTON #${button.index}`);
      console.log(`  text: ${button.text}`);
      console.log(`  id: ${button.id}`);
      console.log(`  name: ${button.name}`);
      console.log(`  type: ${button.type}`);
      console.log(`  class: ${button.className}`);
      console.log(`  value: ${button.value}`);
      console.log(`  disabled: ${button.disabled}`);
      console.log(`  aria-label: ${button.ariaLabel}`);
      console.log(`  title: ${button.title}`);
      console.log("");
    });

    // ============================================================
    // LABEL
    // ============================================================

    console.log("LABEL情報を取得します。");

    const labels = await page.locator("label").evaluateAll((elements) => {
      return elements.map((element, index) => ({
        index: index + 1,
        text: element.innerText.trim(),
        htmlFor: element.htmlFor,
        className: element.className
      }));
    });

    console.log(`LABEL検出数: ${labels.length}`);
    console.log("");

    labels.forEach((label) => {
      console.log(`LABEL #${label.index}`);
      console.log(`  text: ${label.text}`);
      console.log(`  for: ${label.htmlFor}`);
      console.log(`  class: ${label.className}`);
      console.log("");
    });

    // ============================================================
    // FORM
    // ============================================================

    console.log("FORM情報を取得します。");

    const forms = await page.locator("form").evaluateAll((elements) => {
      return elements.map((element, index) => ({
        index: index + 1,
        id: element.id,
        name: element.name,
        action: element.action,
        method: element.method,
        className: element.className
      }));
    });

    console.log(`FORM検出数: ${forms.length}`);
    console.log("");

    forms.forEach((form) => {
      console.log(`FORM #${form.index}`);
      console.log(`  id: ${form.id}`);
      console.log(`  name: ${form.name}`);
      console.log(`  action: ${form.action}`);
      console.log(`  method: ${form.method}`);
      console.log(`  class: ${form.className}`);
      console.log("");
    });

    // ============================================================
    // 本文
    // ============================================================

    console.log("ページ本文を取得します。");

    const bodyText = await page.locator("body").innerText();

    console.log(`本文文字数: ${bodyText.length}`);
    console.log("");

    // ============================================================
    // レポート
    // ============================================================

    const report = {
      testType: "Fishingmax商品ページ詳細調査テスト",
      checkedAt: new Date().toISOString(),
      productUrl,
      httpStatus,
      pageTitle,
      currentUrl,

      elementCounts: {
        links: await page.locator("a").count(),
        buttons: buttons.length,
        inputs: inputs.length,
        selects: selects.length,
        textareas: await page.locator("textarea").count(),
        labels: labels.length,
        forms: forms.length
      },

      selects,
      inputs,
      buttons,
      labels,
      forms,

      bodyTextPreview: bodyText.substring(0, 15000)
    };

    fs.writeFileSync(
      "fishingmax-element-details.json",
      JSON.stringify(report, null, 2),
      "utf8"
    );

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

    // スクリーンショット
    await page.screenshot({
      path: "fishingmax-page.png",
      fullPage: true
    });

    console.log("========================================");
    console.log("商品ページ詳細調査テスト成功");
    console.log("========================================");
    console.log("");
    console.log("保存ファイル:");
    console.log("- fishingmax-element-details.json");
    console.log("- fishingmax-page-report.json");
    console.log("- fishingmax-page-text.txt");
    console.log("- fishingmax-page.png");
    console.log("");

  } catch (error) {

    // エラー内容をファイルに保存
    const errorText = [
      "Fishingmax Playwright Test Error",
      "========================================",
      "",
      `日時: ${new Date().toISOString()}`,
      "",
      "エラー名:",
      error && error.name ? error.name : "(不明)",
      "",
      "エラーメッセージ:",
      error && error.message ? error.message : "(不明)",
      "",
      "スタックトレース:",
      error && error.stack ? error.stack : "(なし)",
      ""
    ].join("\n");

    fs.writeFileSync(
      "fishingmax-error.txt",
      errorText,
      "utf8"
    );

    console.error("");
    console.error("========================================");
    console.error("Fishingmaxテスト中にエラーが発生しました");
    console.error("========================================");
    console.error(errorText);

    // ページまで作成できていた場合は診断情報を保存
    if (page) {
      try {
        fs.writeFileSync(
          "fishingmax-error-page-url.txt",
          page.url(),
          "utf8"
        );
      } catch {
        // 診断保存自体の失敗は無視
      }

      try {
        await page.screenshot({
          path: "fishingmax-error-page.png",
          fullPage: true
        });
      } catch {
        // スクリーンショット失敗は無視
      }

      try {
        const errorPageText = await page.locator("body").innerText();

        fs.writeFileSync(
          "fishingmax-error-page-text.txt",
          errorPageText,
          "utf8"
        );
      } catch {
        // 本文取得失敗は無視
      }
    }

    throw error;

  } finally {
    if (context) {
      await context.close();
    }

    if (browser) {
      await browser.close();
    }
  }
}

main().catch((error) => {
  console.error("");
  console.error("最終エラー:");
  console.error(error.message);
  console.error("");

  process.exit(1);
});
