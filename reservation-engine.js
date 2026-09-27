```javascript
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
  console.log("Fishingmax 商品ページ詳細調査テスト");
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

    /*
     * ============================================================
     * SELECT 詳細
     * ============================================================
     */

    const selects = await page.locator("select").evaluateAll((elements) => {
      return elements.map((element, index) => {
        const options = Array.from(element.options).map((option) => ({
          text: option.textContent.trim(),
          value: option.value,
          selected: option.selected,
          disabled: option.disabled
        }));

        return {
          index: index + 1,
          id: element.id,
          name: element.name,
          className: element.className,
          value: element.value,
          disabled: element.disabled,
          required: element.required,
          ariaLabel: element.getAttribute("aria-label"),
          options
        };
      });
    });

    console.log("---------- SELECT 詳細 ----------");

    if (selects.length === 0) {
      console.log("SELECTは検出されませんでした。");
    } else {
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
    }

    /*
     * ============================================================
     * INPUT 詳細
     * ============================================================
     */

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

    console.log("---------- INPUT 詳細 ----------");

    if (inputs.length === 0) {
      console.log("INPUTは検出されませんでした。");
    } else {
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
    }

    /*
     * ============================================================
     * BUTTON 詳細
     * ============================================================
     */

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

    console.log("---------- BUTTON 詳細 ----------");

    if (buttons.length === 0) {
      console.log("BUTTONは検出されませんでした。");
    } else {
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
    }

    /*
     * ============================================================
     * LABEL 詳細
     * ============================================================
     */

    const labels = await page.locator("label").evaluateAll((elements) => {
      return elements.map((element, index) => ({
        index: index + 1,
        text: element.innerText.trim(),
        htmlFor: element.htmlFor,
        className: element.className
      }));
    });

    console.log("---------- LABEL 詳細 ----------");

    if (labels.length === 0) {
      console.log("LABELは検出されませんでした。");
    } else {
      labels.forEach((label) => {
        console.log(`LABEL #${label.index}`);
        console.log(`  text: ${label.text}`);
        console.log(`  for: ${label.htmlFor}`);
        console.log(`  class: ${label.className}`);
        console.log("");
      });
    }

    /*
     * ============================================================
     * 商品情報に関連するDOM
     * ============================================================
     */

    const productForms = await page.locator("form").evaluateAll((elements) => {
      return elements.map((element, index) => ({
        index: index + 1,
        id: element.id,
        name: element.name,
        action: element.action,
        method: element.method,
        className: element.className
      }));
    });

    console.log("---------- FORM 詳細 ----------");

    if (productForms.length === 0) {
      console.log("FORMは検出されませんでした。");
    } else {
      productForms.forEach((form) => {
        console.log(`FORM #${form.index}`);
        console.log(`  id: ${form.id}`);
        console.log(`  name: ${form.name}`);
        console.log(`  action: ${form.action}`);
        console.log(`  method: ${form.method}`);
        console.log(`  class: ${form.className}`);
        console.log("");
      });
    }

    /*
     * ============================================================
     * 商品ページ本文
     * ============================================================
     */

    const bodyText = await page.locator("body").innerText();

    /*
     * ============================================================
     * 詳細レポート保存
     * ============================================================
     */

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
        forms: productForms.length
      },

      selects,
      inputs,
      buttons,
      labels,
      forms: productForms,

      bodyTextPreview: bodyText.substring(0, 15000)
    };

    fs.writeFileSync(
      "fishingmax-element-details.json",
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
    console.log("fishingmax-element-details.json");
    console.log("fishingmax-page-text.txt");
    console.log("fishingmax-page.png");
    console.log("");

    console.log("========================================");
    console.log("商品ページ詳細調査テスト完了");
    console.log("========================================");
    console.log("");
    console.log("今回のテストでは以下を実行していません。");
    console.log("- 商品種類の変更");
    console.log("- 出船時間の変更");
    console.log("- 数量変更");
    console.log("- カート投入");
    console.log("- 注文処理");
    console.log("- 注文確定");
    console.log("");
    console.log("商品ページのHTML要素を読み取っただけです。");

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
```
