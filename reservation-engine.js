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

  // 今回のテスト設定
  const desiredTime = process.env.DESIRED_TIME || "11時00分";
  const desiredQuantity = process.env.DESIRED_QUANTITY || "1";

  let browser = null;
  let context = null;
  let page = null;

  try {
    console.log("========================================");
    console.log("Fishingmax 選択操作テスト");
    console.log("========================================");
    console.log("");

    console.log(`商品URL: ${productUrl}`);
    console.log(`希望時間: ${desiredTime}`);
    console.log(`希望数量: ${desiredQuantity}`);
    console.log("");

    validateProductUrl(productUrl);

    const quantityNumber = Number(desiredQuantity);

    if (!Number.isInteger(quantityNumber) || quantityNumber < 1) {
      throw new Error(
        "DESIRED_QUANTITY は1以上の整数で指定してください。"
      );
    }

    console.log("設定値の検証: OK");
    console.log("");

    // ブラウザ起動
    browser = await chromium.launch({
      headless: true
    });

    context = await browser.newContext({
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      viewport: {
        width: 390,
        height: 844
      }
    });

    page = await context.newPage();

    console.log("Fishingmaxの商品ページへアクセスします。");

    const response = await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.waitForTimeout(3000);

    const httpStatus = response ? response.status() : null;

    console.log(`HTTPステータス: ${httpStatus}`);
    console.log(`ページタイトル: ${await page.title()}`);
    console.log(`現在のURL: ${page.url()}`);
    console.log("");

    // ============================================================
    // 出船時間SELECTを特定
    // ============================================================

    const timeSelect = page.locator(
      'select[name="options[出船時間]"]'
    );

    const timeSelectCount = await timeSelect.count();

    console.log(
      `出船時間SELECT検出数: ${timeSelectCount}`
    );

    if (timeSelectCount !== 1) {
      throw new Error(
        `出船時間SELECTを正しく特定できませんでした。検出数=${timeSelectCount}`
      );
    }

    // 利用可能な選択肢を確認
    const timeOptions = await timeSelect.locator("option").evaluateAll(
      (options) => {
        return options.map((option) => ({
          text: option.textContent.trim(),
          value: option.value,
          selected: option.selected,
          disabled: option.disabled
        }));
      }
    );

    console.log("---------- 出船時間の選択肢 ----------");

    timeOptions.forEach((option) => {
      console.log(
        `text="${option.text}" value="${option.value}" selected=${option.selected} disabled=${option.disabled}`
      );
    });

    console.log("");

    const targetOption = timeOptions.find(
      (option) => option.value === desiredTime
    );

    if (!targetOption) {
      throw new Error(
        `希望時間「${desiredTime}」は商品ページに存在しません。`
      );
    }

    if (targetOption.disabled) {
      throw new Error(
        `希望時間「${desiredTime}」は選択肢として無効になっています。`
      );
    }

    // ============================================================
    // 出船時間を選択
    // ============================================================

    console.log(
      `出船時間「${desiredTime}」を選択します。`
    );

    await timeSelect.selectOption({
      value: desiredTime
    });

    // Shopify側のバリアント更新処理を待つ
    await page.waitForTimeout(1000);

    const selectedTime = await timeSelect.inputValue();

    console.log(
      `選択後の出船時間: ${selectedTime}`
    );

    if (selectedTime !== desiredTime) {
      throw new Error(
        `出船時間の選択に失敗しました。期待値=${desiredTime} 実際=${selectedTime}`
      );
    }

    console.log("出船時間の選択: OK");
    console.log("");

    // ============================================================
    // 数量入力
    // ============================================================

    const quantityInput = page.locator(
      "#Quantity-template--27235294904633__main"
    );

    const quantityCount = await quantityInput.count();

    console.log(
      `数量入力欄検出数: ${quantityCount}`
    );

    if (quantityCount !== 1) {
      throw new Error(
        `数量入力欄を正しく特定できませんでした。検出数=${quantityCount}`
      );
    }

    console.log(
      `数量を ${quantityNumber} に設定します。`
    );

    await quantityInput.fill(String(quantityNumber));

    const selectedQuantity = await quantityInput.inputValue();

    console.log(
      `設定後の数量: ${selectedQuantity}`
    );

    if (selectedQuantity !== String(quantityNumber)) {
      throw new Error(
        `数量設定に失敗しました。期待値=${quantityNumber} 実際=${selectedQuantity}`
      );
    }

    console.log("数量設定: OK");
    console.log("");

    // ============================================================
    // hidden variant ID確認
    // ============================================================

    const variantInput = page.locator(
      'input.product-variant-id[name="id"]'
    );

    const variantCount = await variantInput.count();

    console.log(
      `商品バリアントID入力欄検出数: ${variantCount}`
    );

    let variantId = null;

    if (variantCount > 0) {
      variantId = await variantInput.first().inputValue();

      console.log(
        `選択後の商品バリアントID: ${variantId}`
      );
    } else {
      console.log(
        "商品バリアントID入力欄は検出されませんでした。"
      );
    }

    console.log("");

    // ============================================================
    // カートボタンの状態だけ確認
    // ============================================================

    const cartButton = page.locator(
      "#ProductSubmitButton-template--27235294904633__main"
    );

    const cartButtonCount = await cartButton.count();

    console.log(
      `カートボタン検出数: ${cartButtonCount}`
    );

    let cartButtonDisabled = null;
    let cartButtonText = null;

    if (cartButtonCount === 1) {
      cartButtonDisabled = await cartButton.isDisabled();
      cartButtonText = await cartButton.innerText();

      console.log(`カートボタン: ${cartButtonText}`);
      console.log(
        `カートボタンdisabled: ${cartButtonDisabled}`
      );
    }

    console.log("");

    // ============================================================
    // 現在の状態を保存
    // ============================================================

    const result = {
      testType: "Fishingmax 選択操作テスト",
      checkedAt: new Date().toISOString(),

      productUrl,
      httpStatus,

      requested: {
        time: desiredTime,
        quantity: quantityNumber
      },

      actual: {
        time: selectedTime,
        quantity: selectedQuantity,
        variantId
      },

      cartButton: {
        detected: cartButtonCount === 1,
        text: cartButtonText,
        disabled: cartButtonDisabled
      },

      availableTimeOptions: timeOptions,

      importantNote:
        "カート投入・購入手続き・注文確定は実行していません。"
    };

    fs.writeFileSync(
      "fishingmax-selection-test.json",
      JSON.stringify(result, null, 2),
      "utf8"
    );

    // 本文も保存
    const bodyText = await page.locator("body").innerText();

    fs.writeFileSync(
      "fishingmax-page-text.txt",
      bodyText,
      "utf8"
    );

    // 選択後の画面を保存
    await page.screenshot({
      path: "fishingmax-selection-test.png",
      fullPage: true
    });

    console.log("========================================");
    console.log("選択操作テスト完了");
    console.log("========================================");
    console.log("");

    console.log("結果:");
    console.log(`出船時間: ${selectedTime}`);
    console.log(`数量: ${selectedQuantity}`);
    console.log(`商品バリアントID: ${variantId}`);
    console.log("");

    console.log("カート投入は実行していません。");
    console.log("注文処理は実行していません。");
    console.log("注文確定は実行していません。");
    console.log("");

    console.log("保存ファイル:");
    console.log("- fishingmax-selection-test.json");
    console.log("- fishingmax-page-text.txt");
    console.log("- fishingmax-selection-test.png");

  } catch (error) {
    fs.writeFileSync(
      "fishingmax-error.txt",
      [
        "Fishingmax Selection Test Error",
        "========================================",
        "",
        `日時: ${new Date().toISOString()}`,
        "",
        "エラー:",
        error.message,
        "",
        "Stack:",
        error.stack || ""
      ].join("\n"),
      "utf8"
    );

    if (page) {
      try {
        await page.screenshot({
          path: "fishingmax-error-page.png",
          fullPage: true
        });
      } catch {
        // 無視
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
  console.error("========================================");
  console.error("選択操作テストでエラーが発生しました");
  console.error("========================================");
  console.error(error.message);
  console.error("");

  process.exit(1);
});
