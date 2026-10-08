// 아래 따옴표 안에 본인의 Supabase 프로젝트 URL과 공개 API 키를 넣어주세요.
// KEY에는 publishable 또는 anon 키를 사용합니다. service_role 키는 넣지 마세요.
const SUPABASE_URL = "https://cdojgrbqqgybefkmzpms.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkb2pncmJxcWd5YmVma216cG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MjIwNzEsImV4cCI6MjEwNjk5ODA3MX0.Dpr1z_DJxs04zF8XugxwsW-oE6f1UNSC9_RF89fn5M4";

// 첫 주문 때 연결 객체를 만들고, 다음 주문에서도 같은 객체를 사용합니다.
// 값을 아직 넣지 않았더라도 주문서의 금액 계산과 탭은 사용할 수 있습니다.
let supabaseClient = null;

// index.html에서 script.js를 defer로 연결했으므로,
// HTML 요소가 모두 만들어진 뒤에 이 코드가 실행됩니다.
// getElementById()는 HTML에 적힌 id로 원하는 요소를 찾는 함수입니다.
const orderForm = document.getElementById("order-form");
const customerNameInput = document.getElementById("customer-name");
const customerPhoneInput = document.getElementById("customer-phone");
const drinkSelect = document.getElementById("drink");
const quantityInput = document.getElementById("quantity");
const totalPrice = document.getElementById("total-price");
const orderConfirmation = document.getElementById("order-confirmation");
const requestsInput = document.getElementById("requests");
const tabButtons = document.querySelectorAll('.tab-button');
const ordersList = document.getElementById("orders-list");
const orderCount = document.getElementById("order-count");
const ordersSummary = document.getElementById("orders-summary");
const ordersTotal = document.getElementById("orders-total");
const clearOrdersButton = document.getElementById("clear-orders");
const submitOrderButton = document.getElementById("submit-order");

// 저장 중인지를 기억해 버튼 클릭이나 Enter 키로 같은 주문이 두 번 제출되지 않게 합니다.
let isSavingOrder = false;

// 접수한 주문들을 배열에 보관합니다. 페이지를 새로고침하면 내역은 초기화됩니다.
const orders = [];
// 주문을 취소하거나 모두 지워도 번호가 겹치지 않도록 따로 증가시킵니다.
let nextOrderNumber = 1;

// 선택한 탭만 활성화하고, 나머지 영역은 기존 hidden 클래스로 숨깁니다.
function switchTab(selectedTab) {
  tabButtons.forEach(function (tab) {
    const isSelected = tab === selectedTab;
    const panel = document.getElementById(tab.getAttribute("aria-controls"));
    tab.classList.toggle("active", isSelected);
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
    panel.classList.toggle("hidden", !isSelected);
  });
}

tabButtons.forEach(function (tab, index) {
  tab.addEventListener("click", function () {
    switchTab(tab);
  });

  // 키보드의 좌우 방향키로도 탭을 옮길 수 있습니다.
  tab.addEventListener("keydown", function (event) {
    let nextIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % tabButtons.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index + tabButtons.length - 1) % tabButtons.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabButtons.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    switchTab(tabButtons[nextIndex]);
    tabButtons[nextIndex].focus();
  });
});

// 주문 목록, 건수 배지, 총 금액은 이 함수 한 곳에서 함께 갱신합니다.
function renderOrders() {
  // replaceChildren()은 이전 카드를 비웁니다. HTML 문자열을 넣지 않습니다.
  ordersList.replaceChildren();
  orderCount.textContent = String(orders.length);
  const total = orders.reduce(function (sum, order) {
    return sum + order.total;
  }, 0);
  ordersTotal.textContent = `총 주문 금액: ${total.toLocaleString("ko-KR")}원 (${orders.length}건)`;
  ordersSummary.classList.toggle("hidden", orders.length === 0);

  if (orders.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-orders";
    emptyMessage.textContent = "아직 주문 내역이 없어요 ☕";
    ordersList.append(emptyMessage);
    return;
  }

  // 새 주문을 배열 맨 앞에 저장하므로, 차례대로 그리면 최신순이 됩니다.
  orders.forEach(function (order) {
    const card = document.createElement("article");
    card.className = "order-card";

    const title = document.createElement("p");
    title.className = "order-title";
    // 손님이 입력한 이름은 textContent로 넣어 HTML로 실행되지 않게 합니다.
    title.textContent = `#${order.number} ${order.customerName}님 · ${order.total.toLocaleString("ko-KR")}원`;

    const details = document.createElement("p");
    details.className = "order-details";
    const extraText = order.options.length > 0 ? " (" + order.options.join(", ") + ")" : "";
    details.textContent = `${order.drink} ${order.size}사이즈${extraText} ${order.quantity}잔`;

    const meta = document.createElement("p");
    meta.className = "order-meta";
    const orderTime = order.orderedAt.toLocaleString("ko-KR");
    // 요청사항이 없으면 시간만 표시합니다. 요청사항도 글자로만 넣습니다.
    meta.textContent = order.requests ? `${order.requests} · ${orderTime}` : orderTime;

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "cancel-order";
    cancelButton.textContent = "취소";
    cancelButton.setAttribute("aria-label", `#${order.number} 주문 취소`);
    cancelButton.addEventListener("click", function () {
      if (!confirm(`#${order.number} 주문을 취소할까요?`)) {
        return;
      }
      // 기존 취소 기능은 현재 화면의 내역만 지웁니다. DB 주문은 삭제하지 않습니다.
      // findIndex()로 이 주문의 위치를 찾아, splice()로 한 건만 삭제합니다.
      const orderIndex = orders.findIndex(function (savedOrder) {
        return savedOrder.number === order.number;
      });
      if (orderIndex !== -1) {
        orders.splice(orderIndex, 1);
        renderOrders();
        // 누른 버튼이 삭제되므로, 남은 주문 버튼이나 내역 탭으로 초점을 옮깁니다.
        const remainingButtons = ordersList.querySelectorAll(".cancel-order");
        const nextButton = remainingButtons[Math.min(orderIndex, remainingButtons.length - 1)];
        (nextButton || document.getElementById("history-tab")).focus();
      }
    });

    card.append(title, cancelButton, details, meta);
    ordersList.append(card);
  });
}

clearOrdersButton.addEventListener("click", function () {
  if (orders.length === 0 || !confirm("주문 내역을 모두 지울까요?")) {
    return;
  }
  // 화면에 보관한 내역만 지웁니다. Supabase에 저장한 주문은 유지됩니다.
  // 배열의 길이를 0으로 만들면 안에 있던 주문이 모두 지워집니다.
  orders.length = 0;
  renderOrders();
  // 모두 지우기 버튼도 숨겨지므로 키보드 초점을 내역 탭으로 돌립니다.
  document.getElementById("history-tab").focus();
});

// 예상 금액 계산은 이 함수 한 곳에서만 처리합니다.
// 입력이 바뀌었을 때와 주문을 접수할 때 같은 함수를 재사용합니다.
function calculateTotal() {
  // 음료를 고르지 않았다면 사이즈나 옵션을 선택해도 금액은 0원입니다.
  if (drinkSelect.value === "") {
    totalPrice.textContent = (0).toLocaleString("ko-KR");
    return 0;
  }

  // selectedOptions[0]은 현재 선택된 음료의 <option> 요소입니다.
  // dataset.price로 data-price를 읽을 수 있습니다.
  // 속성값은 문자열이므로 Number()로 숫자로 바꿔야 더하기가 가능합니다.
  const selectedDrink = drinkSelect.selectedOptions[0];
  const drinkPrice = Number(selectedDrink.dataset.price);

  // :checked는 현재 선택된 라디오 버튼이나 체크박스를 찾는 조건입니다.
  const selectedSize = orderForm.querySelector('input[name="size"]:checked');
  const sizePrice = Number(selectedSize.dataset.price);
  const selectedExtras = orderForm.querySelectorAll('input[name="extras"]:checked');

  // 체크한 옵션은 여러 개일 수 있으므로 각각의 가격을 더합니다.
  let extrasPrice = 0;
  selectedExtras.forEach(function (extra) {
    extrasPrice += Number(extra.dataset.price);
  });

  // 수량을 지우고 다시 입력하는 중에도 금액이 정상적으로 표시되도록
  // 빈 값은 1로 계산하고, 계산에 사용하는 최소 수량도 1로 제한합니다.
  const quantity = Math.max(1, Number(quantityInput.value) || 1);

  // 사이즈와 옵션 가격은 한 잔마다 붙으므로 모두 더한 뒤 수량을 곱합니다.
  const total = (drinkPrice + sizePrice + extrasPrice) * quantity;

  // toLocaleString("ko-KR")는 5000 같은 숫자를 "5,000"으로 바꿉니다.
  // textContent는 요소 안에 글자만 넣으므로 HTML 태그로 해석되지 않습니다.
  totalPrice.textContent = total.toLocaleString("ko-KR");

  // return으로 계산한 숫자를 돌려주면 주문 확인 메시지에도 사용할 수 있습니다.
  return total;
}

// 음료, 사이즈, 옵션의 선택이 바뀌면 폼에서 change 이벤트가 발생합니다.
orderForm.addEventListener("change", calculateTotal);

// 수량은 숫자를 입력하거나 지우는 순간에도 금액이 바뀌도록 input을 사용합니다.
quantityInput.addEventListener("input", calculateTotal);

// 버튼 클릭뿐 아니라 이름 입력 중 Enter 키를 눌러도 주문을 처리합니다.
orderForm.addEventListener("submit", async function (event) {
  // 폼의 기본 제출 동작(페이지 이동 또는 새로고침)을 막습니다.
  event.preventDefault();

  // 앞선 주문을 저장하고 있다면 새 제출은 처리하지 않습니다.
  if (isSavingOrder) {
    return;
  }

  // trim()은 양끝 공백을 없애므로 공백만 입력한 이름도 걸러낼 수 있습니다.
  const customerName = customerNameInput.value.trim();
  if (customerName === "") {
    alert("이름을 입력해주세요");
    customerNameInput.focus();
    return;
  }

  if (drinkSelect.value === "") {
    alert("음료를 선택해주세요");
    drinkSelect.focus();
    return;
  }

  // 수량이 비어 있으면 기본값 1을 사용합니다.
  // HTML의 min="1", max="10"과 기본 정수 단위를 만족하는지도 확인합니다.
  // 폼에 novalidate가 있으므로 수량 검사는 여기서 직접 실행합니다.
  if (quantityInput.value === "") {
    quantityInput.value = "1";
  }
  if (!quantityInput.checkValidity()) {
    quantityInput.reportValidity();
    return;
  }

  const selectedDrink = drinkSelect.selectedOptions[0];
  const selectedSize = orderForm.querySelector('input[name="size"]:checked');
  const selectedExtras = orderForm.querySelectorAll('input[name="extras"]:checked');

  // 화면의 음료 항목에는 가격도 있으므로 맨 뒤의 가격 부분만 지웁니다.
  // 정규식의 \s는 공백, [\d,]는 숫자 또는 쉼표, $는 글자의 끝을 뜻합니다.
  // 예: "카페라떼 4,000원" → "카페라떼"
  const drinkName = selectedDrink.textContent.replace(/\s+[\d,]+원\s*$/, "").trim();

  // 옵션 이름도 기존 HTML의 label에서 읽어 가격만 제거합니다.
  // 새로운 옵션을 추가하더라도 이름과 가격을 자바스크립트에 따로 적을 필요가 없습니다.
  const extraNames = [];
  selectedExtras.forEach(function (extra) {
    const label = orderForm.querySelector('label[for="' + extra.id + '"]');
    const extraName = label.textContent.replace(/\s*\+[\d,]+원\s*$/, "").trim();
    extraNames.push(extraName);
  });

  // 옵션이 있으면 쉼표로 이어 괄호에 넣고, 없으면 빈 문자열을 사용합니다.
  const extraText = extraNames.length > 0 ? " (" + extraNames.join(", ") + ")" : "";
  const quantity = Number(quantityInput.value);
  const total = calculateTotal();

  // 왼쪽 이름은 Supabase orders 테이블의 열 이름과 정확히 같아야 합니다.
  // options는 문자열로 합치지 않고 배열 그대로 보냅니다.
  // 저장을 기다리는 동안 입력을 바꿔도 접수할 주문은 이 값으로 유지됩니다.
  const orderData = {
    customer_name: customerName,
    phone: customerPhoneInput.value.trim(),
    drink: drinkName,
    drink_price: Number(selectedDrink.dataset.price),
    size: selectedSize.value,
    options: extraNames,
    quantity: quantity,
    request: requestsInput.value.trim(),
    total_price: total
  };

  // await로 저장을 기다리기 전에 버튼을 막고, 처리 중이라는 글자를 보여줍니다.
  isSavingOrder = true;
  const originalButtonText = submitOrderButton.textContent;
  submitOrderButton.disabled = true;
  submitOrderButton.textContent = "저장 중...";
  orderConfirmation.textContent = "";
  orderConfirmation.classList.add("hidden");

  // 실패했을 때 어느 단계에서 막혔는지 함께 표시합니다.
  let savingStage = "Supabase 연결";

  // try는 저장을 시도하고, catch는 실패를 처리하고, finally는 항상 실행됩니다.
  try {
    if (!supabaseClient) {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error("script.js 맨 위의 SUPABASE_URL과 SUPABASE_KEY를 입력해주세요.");
      }
      if (!window.supabase) {
        throw new Error("Supabase CDN 라이브러리를 불러오지 못했습니다.");
      }
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    // supabase.sql은 본인 주문만 저장하도록 인증을 요구합니다.
    // 기존 로그인 정보가 없으면 익명으로 로그인합니다. 로그인 화면은 필요 없습니다.
    // Supabase의 Authentication 설정에서 Anonymous Sign-Ins를 먼저 켜주세요.
    savingStage = "로그인 상태 확인";
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    if (!sessionData.session) {
      savingStage = "익명 로그인";
      const { error: authError } = await supabaseClient.auth.signInAnonymously();
      if (authError) {
        throw authError;
      }
    }

    // from()으로 테이블을 고르고, insert()로 주문 한 건을 저장합니다.
    // await는 응답을 기다립니다. Supabase가 돌려준 error가 있으면 실패로 처리합니다.
    savingStage = "DB 저장";
    const { error } = await supabaseClient.from("orders").insert(orderData);
    if (error) {
      throw error;
    }

    // DB 저장에 성공한 주문만 화면의 주문 내역에도 추가합니다.
    // unshift()는 배열 맨 앞에 추가합니다. 이 배열은 현재 페이지에서만 유지됩니다.
    orders.unshift({
      number: nextOrderNumber,
      customerName: orderData.customer_name,
      drink: orderData.drink,
      size: orderData.size,
      options: orderData.options,
      quantity: orderData.quantity,
      requests: orderData.request,
      total: orderData.total_price,
      orderedAt: new Date()
    });
    nextOrderNumber += 1;
    renderOrders();

    // 백틱(`)으로 감싼 문자열 안의 ${변수} 자리에 실제 값이 들어갑니다.
    orderConfirmation.textContent = `${customerName}님, ${drinkName} ${orderData.size}사이즈${extraText} ${quantity}잔, 총 ${total.toLocaleString("ko-KR")}원 주문이 접수되었습니다!`;
    orderConfirmation.classList.remove("hidden");
  } catch (error) {
    const errorMessage = error?.message || "알 수 없는 오류가 발생했습니다.";
    const errorCode = error?.code ? ` (${error.code})` : "";
    const schemaErrorCodes = ["PGRST204", "PGRST205", "42703", "42P01", "42501"];
    const setupHelp = schemaErrorCodes.includes(error?.code)
      ? "\nSupabase SQL Editor에서 최신 supabase.sql 전체를 실행해주세요."
      : "";
    alert(`주문 저장에 실패했어요.\n단계: ${savingStage}\n원인: ${errorMessage}${errorCode}${setupHelp}`);
    // 개발자 도구의 콘솔에서 설정, 로그인, DB 저장 오류의 자세한 내용을 확인합니다.
    console.error("주문 저장 오류:", error);
  } finally {
    // 성공하거나 실패하더라도 버튼을 다시 사용할 수 있도록 돌려놓습니다.
    isSavingOrder = false;
    submitOrderButton.disabled = false;
    submitOrderButton.textContent = originalButtonText;
  }
});

// type="reset"인 다시 작성 버튼은 폼의 모든 입력을 HTML 기본값으로 되돌립니다.
// 이 HTML의 기본값은 음료 미선택, M 사이즈, 수량 1, 옵션 미선택입니다.
orderForm.addEventListener("reset", function () {
  // 다시 작성은 주문서와 확인 메시지만 초기화하고 orders 배열은 유지합니다.
  orderConfirmation.textContent = "";
  orderConfirmation.classList.add("hidden");

  // reset 이벤트는 실제 입력값이 초기화되기 전에 실행됩니다.
  // setTimeout(..., 0)으로 기본 초기화가 끝난 뒤 금액을 다시 계산합니다.
  setTimeout(calculateTotal, 0);
});

// 페이지를 처음 열었을 때도 현재 입력값으로 예상 금액을 표시합니다.
calculateTotal();
renderOrders();
