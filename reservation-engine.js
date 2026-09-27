const { chromium } = require("playwright");
const fs = require("fs");

const ENGINE_VERSION = "2026-09-27-cart-v4";

const POLL_INTERVAL_MS = 500;
const PAGE_LOAD_TIMEOUT = 30000;
const CHECKOUT_TIMEOUT = 30000;

function validateProductUrl(productUrl) {
  if (!productUrl) {
    throw new Error("PRODUCT_URL が指定されていません。");
  }

  const url = new URL(productUrl);

  if (url.protocol !== "https:") {
    throw new Error("HTTPSのURLを指定してください。");
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

async function getTargetTime(page, desiredTime) {
  const select = page.locator(
    'select[name="options[出船時間]"]'
  );

  if (await select.count() !== 1) {
    throw new Error(
      "出船時間SELECTを特定できませんでした。"
    );
  }

  const options = await select.locator("option").evaluateAll(
    elements =>
      elements.map(element => ({
        text: element.textContent.trim(),
        value: element.value,
        disabled: element.disabled
      }))
  );

  const target = options.find(
    option => option.value === desiredTime
  );

  if (!target) {
    throw new Error(
      `指定時間「${desiredTime}」が見つかりません。`
    );
  }

  return {
    select,
    options,
    target
  };
}

async function waitForStock(page, desiredTime) {
  let attempt = 0;

  while (true) {
    attempt++;

    const result =
      await getTargetTime(
        page,
        desiredTime
      );

    console.log(
      `[監視 ${attempt}] ${result.target.text}`
    );

    if (
      result.target.text.includes("在庫：○") &&
      !result.target.disabled
    ) {
      console.log(
        `指定時間 ${desiredTime} の在庫を検出しました。`
      );

      return result;
    }

    await page.waitForTimeout(
      POLL_INTERVAL_MS
    );

    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT
    });

    await page.waitForTimeout(100);
  }
}

async function findCartButton(page) {
  const exactSelector =
    "#ProductSubmitButton-template--27235294904633__main";

  const exactButton =
    page.locator(exactSelector);

  if (await exactButton.count() === 1) {
    return {
      locator: exactButton,
      method: "known-selector"
    };
  }

  const selectors = [
    'button[name="add"]',
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("カートに入れる")',
    'button:has-text("カートに追加")',
    'input[value*="カートに入れる"]',
    'input[value*="カートに追加"]'
  ];

  for (const selector of selectors) {
    const locator =
      page.locator(selector);

    const count =
      await locator.count();

    for (let i = 0; i < count; i++) {
      const candidate =
        locator.nth(i);

      if (
        await candidate.isVisible()
          .catch(() => false)
      ) {
        return {
          locator: candidate,
          method: selector
        };
      }
    }
  }

  return null;
}

async function getButtonDiagnostics(page) {
  return await page.locator(
    "button, input[type='submit'], input[type='button']"
  ).evaluateAll(elements =>
    elements.map((element, index) => ({
      index,
      tag: element.tagName,
      id: element.id || "",
      name: element.getAttribute("name") || "",
      type: element.getAttribute("type") || "",
      text: (
        element.innerText ||
        element.value ||
        ""
      ).trim(),
      disabled: !!element.disabled,
      visible:
        !!(
          element.offsetWidth ||
          element.offsetHeight ||
          element.getClientRects().length
        )
    }))
  );
}

async function findCheckoutButton(page) {
  const selectors = [
    'a[href*="/checkout"]',
    'button[name="checkout"]',
    'input[name="checkout"]',
    'button:has-text("ご購入手続きへ")',
    'a:has-text("ご購入手続きへ")',
    'button:has-text("購入手続きへ")',
    'a:has-text("購入手続きへ")',
    'button:has-text("チェックアウト")',
    'a:has-text("チェックアウト")'
  ];

  for (const selector of selectors) {
    const locator =
      page.locator(selector);

    const count =
      await locator.count();

    for (let i = 0; i < count; i++) {
      const candidate =
        locator.nth(i);

      if (
        await candidate.isVisible()
          .catch(() => false)
      ) {
        return candidate;
      }
    }
  }

  return null;
}

async function waitForCheckoutButton(page) {
  const deadline =
    Date.now() + CHECKOUT_TIMEOUT;

  while (Date.now() < deadline) {
    const button =
      await findCheckoutButton(page);

    if (button) {
      return button;
    }

    await page.waitForTimeout(200);
  }

  return null;
}

async function findFinalOrderButtons(page) {
  const selectors = [
    'button[name="commit"]',
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("注文を確定する")',
    'button:has-text("注文を確定")',
    'button:has-text("購入を確定する")',
    'button:has-text("購入を確定")',
    'button:has-text("注文する")',
    'button:has-text("購入する")',
    'input[value*="注文を確定"]',
    'input[value*="購入を確定"]'
  ];

  const results = [];

  for (const selector of selectors) {
    const locator =
      page.locator(selector);

    const count =
      await locator.count();

    for (let i = 0; i < count; i++) {
      const candidate =
        locator.nth(i);

      if (
        !(await candidate.isVisible()
          .catch(() => false))
      ) {
        continue;
      }

      const text = (
        await candidate.innerText()
          .catch(() => "")
      ).trim();

      const value =
        await candidate
          .getAttribute("value")
          .catch(() => null);

      const combined =
        `${text} ${value || ""}`;

      if (
        /注文を確定|購入を確定|注文する|購入する/
          .test(combined)
      ) {
        results.push(combined.trim());
      }
    }
  }

  return results;
}

async function main() {
  const productUrl =
    process.env.PRODUCT_URL;

  const desiredTime =
    process.env.DESIRED_TIME ||
    "11時00分";

  const desiredQuantity =
    process.env.DESIRED_QUANTITY ||
    "1";

  let browser = null;
  let context = null;
  let page = null;

  try {
    validateProductUrl(productUrl);

    const quantity =
      Number(desiredQuantity);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      throw new Error(
        "DESIRED_QUANTITY は1以上の整数にしてください。"
      );
    }

    console.log(
      "========================================"
    );
    console.log(
      "Fishingmax 完成系予約エンジン"
    );
    console.log(
      `ENGINE VERSION: ${ENGINE_VERSION}`
    );
    console.log(
      "========================================"
    );

    console.log(
      `商品URL: ${productUrl}`
    );

    console.log(
      `指定時間: ${desiredTime}`
    );

    console.log(
      `数量: ${quantity}`
    );

    console.log("");

    browser =
      await chromium.launch({
        headless: true
      });

    context =
      await browser.newContext({
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
        viewport: {
          width: 390,
          height: 844
        }
      });

    page =
      await context.newPage();

    await page.goto(
      productUrl,
      {
        waitUntil: "domcontentloaded",
        timeout: PAGE_LOAD_TIMEOUT
      }
    );

    await page.waitForTimeout(1500);

    console.log(
      `現在URL: ${page.url()}`
    );

    console.log(
      `タイトル: ${await page.title()}`
    );

    console.log("");

    const stock =
      await waitForStock(
        page,
        desiredTime
      );

    const timeSelect =
      stock.select;

    await timeSelect.selectOption({
      value: desiredTime
    });

    await page.waitForTimeout(300);

    const selectedTime =
      await timeSelect.inputValue();

    if (
      selectedTime !== desiredTime
    ) {
      throw new Error(
        `時間選択に失敗しました。期待=${desiredTime} 実際=${selectedTime}`
      );
    }

    console.log(
      `時間選択成功: ${selectedTime}`
    );

    const quantityInput =
      page.locator(
        "#Quantity-template--27235294904633__main"
      );

    if (
      await quantityInput.count() !== 1
    ) {
      throw new Error(
        "数量入力欄を特定できませんでした。"
      );
    }

    await quantityInput.fill(
      String(quantity)
    );

    const selectedQuantity =
      await quantityInput.inputValue();

    if (
      selectedQuantity !==
      String(quantity)
    ) {
      throw new Error(
        `数量設定に失敗しました。期待=${quantity} 実際=${selectedQuantity}`
      );
    }

    console.log(
      `数量設定成功: ${selectedQuantity}`
    );

    const variantInput =
      page.locator(
        'input.product-variant-id[name="id"]'
      );

    let variantId = null;

    if (
      await variantInput.count() > 0
    ) {
      variantId =
        await variantInput
          .first()
          .inputValue();
    }

    console.log(
      `バリアントID: ${variantId}`
    );

    console.log("");

    console.log(
      "カートボタンを検索します。"
    );

    const cart =
      await findCartButton(page);

    if (!cart) {
      const diagnostics =
        await getButtonDiagnostics(page);

      fs.writeFileSync(
        "fishingmax-button-diagnostics.json",
        JSON.stringify(
          diagnostics,
          null,
          2
        ),
        "utf8"
      );

      throw new Error(
        "カートボタンを特定できませんでした。fishingmax-button-diagnostics.jsonを確認してください。"
      );
    }

    console.log(
      `カートボタン検出方法: ${cart.method}`
    );

    const cartButtonId =
      await cart.locator
        .getAttribute("id")
        .catch(() => null);

    const cartButtonText =
      (
        await cart.locator
          .innerText()
          .catch(() => "")
      ).trim();

    console.log(
      `カートボタンID: ${cartButtonId}`
    );

    console.log(
      `カートボタン文字: ${cartButtonText}`
    );

    if (
      await cart.locator.isDisabled()
    ) {
      throw new Error(
        "カートボタンが無効になっています。"
      );
    }

    console.log("");

    console.log(
      "カート投入を実行します。"
    );

    await cart.locator
      .scrollIntoViewIfNeeded();

    await cart.locator.click({
      force: true,
      timeout: 10000
    });

    console.log(
      "カート投入操作を実行しました。"
    );

    await page.waitForTimeout(2500);

    const cartUrl =
      page.url();

    console.log(
      `カート投入後URL: ${cartUrl}`
    );

    const cartPageText =
      await page.locator(
        "body"
      ).innerText();

    await page.screenshot({
      path:
        "fishingmax-cart-added.png",
      fullPage: true
    });

    console.log("");

    console.log(
      "「ご購入手続きへ」を検索します。"
    );

    const checkoutButton =
      await waitForCheckoutButton(
        page
      );

    if (!checkoutButton) {
      throw new Error(
        "「ご購入手続きへ」ボタンを検出できませんでした。"
      );
    }

    const checkoutText =
      (
        await checkoutButton
          .innerText()
          .catch(() => "")
      ).trim();

    const checkoutHref =
      await checkoutButton
        .getAttribute("href")
        .catch(() => null);

    console.log(
      `購入手続きボタン検出: ${checkoutText}`
    );

    if (checkoutHref) {
      console.log(
        `購入手続きURL: ${checkoutHref}`
      );
    }

    console.log("");

    console.log(
      "購入手続き画面へ進みます。"
    );

    await checkoutButton.click({
      force: true,
      timeout: 10000
    });

    await page.waitForTimeout(3000);

    const checkoutUrl =
      page.url();

    console.log(
      `購入手続き後URL: ${checkoutUrl}`
    );

    console.log("");

    console.log(
      "最終注文ボタンを検索します。"
    );

    const finalButtons =
      await findFinalOrderButtons(
        page
      );

    const finalText =
      await page.locator(
        "body"
      ).innerText();

    await page.screenshot({
      path:
        "fishingmax-checkout-final.png",
      fullPage: true
    });

    fs.writeFileSync(
      "fishingmax-final-result.json",
      JSON.stringify(
        {
          engineVersion:
            ENGINE_VERSION,

          completed: true,

          productUrl,

          requested: {
            time: desiredTime,
            quantity
          },

          actual: {
            time: selectedTime,
            quantity: selectedQuantity,
            variantId
          },

          cart: {
            submitted: true,
            buttonMethod: cart.method,
            buttonId: cartButtonId,
            buttonText: cartButtonText,
            urlAfterCart: cartUrl
          },

          checkout: {
            reached: true,
            buttonText: checkoutText,
            href: checkoutHref,
            urlAfterCheckout:
              checkoutUrl,
            finalOrderButtons:
              finalButtons
          },

          safety: {
            finalOrderButtonClicked:
              false,
            orderConfirmed:
              false
          },

          pageTextPreview:
            finalText.substring(
              0,
              20000
            )
        },
        null,
        2
      ),
      "utf8"
    );

    fs.writeFileSync(
      "fishingmax-page-text.txt",
      finalText,
      "utf8"
    );

    console.log("");

    console.log(
      "========================================"
    );

    console.log(
      "購入確定直前まで完了"
    );

    console.log(
      "========================================"
    );

    console.log(
      `最終注文ボタン検出数: ${finalButtons.length}`
    );

    console.log("");

    console.log(
      "【停止】注文確定ボタンはクリックしていません。"
    );

  } catch (error) {

    fs.writeFileSync(
      "fishingmax-error.txt",
      [
        "Fishingmax Reservation Engine Error",
        "========================================",
        "",
        `ENGINE VERSION: ${ENGINE_VERSION}`,
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
        fs.writeFileSync(
          "fishingmax-error-page-url.txt",
          page.url(),
          "utf8"
        );
      } catch {}

      try {
        fs.writeFileSync(
          "fishingmax-error-page-text.txt",
          await page.locator(
            "body"
          ).innerText(),
          "utf8"
        );
      } catch {}

      try {
        await page.screenshot({
          path:
            "fishingmax-error-page.png",
          fullPage: true
        });
      } catch {}
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

main().catch(error => {
  console.error("");
  console.error(
    "========================================"
  );
  console.error(
    "Fishingmax予約エンジンでエラー"
  );
  console.error(
    "========================================"
  );
  console.error(error.message);
  console.error("");
  process.exit(1);
});
