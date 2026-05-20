(function () {
  function scrollChatToBottom() {
    const body = document.getElementById('chat-body');
    if (!body) return;
    const run = () => {
      body.scrollTop = body.scrollHeight;
    };
    run();
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text == null ? '' : String(text);
    return d.innerHTML;
  }

  function productRows(products) {
    return products
      .map(
        (p) => `
      <div class="chat-product-row">
        <div class="chat-product-icon"><i class="${escapeHtml(p.iconClass || 'fa-solid fa-tag')}"></i></div>
        <div class="chat-product-info">
          <div class="chat-product-name">${escapeHtml(p.name)}</div>
          <div class="chat-product-cat">${escapeHtml(p.category)}</div>
        </div>
        <div class="chat-product-price">$${Number(p.price).toFixed(0)}</div>
        <button type="button" class="chat-add-btn" data-product-id="${escapeHtml(p.id)}">ADD</button>
      </div>`
      )
      .join('');
  }

  function bindAddButtons(container) {
    container.querySelectorAll('.chat-add-btn[data-product-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.productId;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const res = await fetch(`/api/chat/cart/add/${id}`, { method: 'POST' });
          const data = await res.json();
          btn.textContent = data.success ? '✓' : '!';
          if (data.message) showToast(container, data.message);
        } catch {
          btn.textContent = '!';
        }
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = 'ADD';
        }, 1500);
      });
    });
  }

  function showToast(container, msg) {
    const el = document.createElement('div');
    el.className = 'chat-toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function renderBotResponse(data) {
    if (data.type === 'product_list' && data.products?.length) {
      const moreHint = data.hasMore
        ? '<p class="chat-products-more-hint">Type <strong>show me more</strong> to see more</p>'
        : '';
      const html = `<div class="msg bot-msg bot-msg-products">
        <p class="chat-products-intro">${escapeHtml(data.intro || 'Here are some services I found for you ✦')}</p>
        <div class="chat-product-list">${productRows(data.products)}</div>
        ${moreHint}
      </div>`;
      return html;
    }

    if (data.type === 'order_timeline' && data.orders?.length) {
      const blocks = data.orders
        .map((o) => {
          const steps = o.steps
            .map(
              (s) => `
            <div class="timeline-step ${s.state}">
              <div class="timeline-dot"></div>
              <div><strong>${escapeHtml(s.label)}</strong>${s.note ? `<br><small>${escapeHtml(s.note)}</small>` : ''}</div>
            </div>`
            )
            .join('');
          return `<div class="order-block">
            <p><strong>Order #${escapeHtml(o.shortId)}</strong> · ${escapeHtml(o.status)} · $${Number(o.total).toFixed(2)}</p>
            <small class="text-muted">${escapeHtml(o.items)}</small>
            <div class="timeline">${steps}</div>
          </div>`;
        })
        .join('');
      return `<div class="msg bot-msg bot-msg-rich">${escapeHtml(data.intro || '')}${blocks}</div>`;
    }

    if (data.type === 'cart_summary') {
      const items =
        data.items?.length > 0
          ? data.items
              .map(
                (i) => `<li>${escapeHtml(i.name)} — $${Number(i.price).toFixed(2)}</li>`
              )
              .join('')
          : '<li class="text-muted">Cart is empty</li>';
      return `<div class="msg bot-msg bot-msg-rich">
        <p>${escapeHtml(data.reply || 'Your cart')}</p>
        <ul class="chat-cart-list">${items}</ul>
        <p><strong>Subtotal:</strong> $${data.subtotal} ${data.coupon ? ` · <strong>Coupon:</strong> ${escapeHtml(data.coupon)} (-$${data.discount})` : ''}</p>
        <p><strong>Total:</strong> $${data.total}</p>
        <a href="/checkout" class="chat-checkout-link">Go to checkout →</a>
      </div>`;
    }

    if (data.type === 'faq') {
      return `<div class="msg bot-msg bot-msg-rich">
        <strong>${escapeHtml(data.title)}</strong>
        <p style="margin:8px 0 0">${escapeHtml(data.reply)}</p>
      </div>`;
    }

    const text = (data.reply || '').replace(/\*\*(.+?)\*\*/g, '$1');
    return `<div class="msg bot-msg">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
  }

  async function sendChatMessage(text) {
    const input = document.getElementById('chat-input');
    const message = (text || input?.value || '').trim();
    if (!message) return;

    const body = document.getElementById('chat-body');
    body.insertAdjacentHTML('beforeend', `<div class="msg user-msg">${escapeHtml(message)}</div>`);
    if (input) input.value = '';
    hideSuggest();
    scrollChatToBottom();

    const loading = document.createElement('div');
    loading.className = 'msg bot-msg';
    loading.textContent = '…';
    body.appendChild(loading);
    scrollChatToBottom();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      loading.remove();
      const wrap = document.createElement('div');
      wrap.innerHTML = renderBotResponse(data);
      while (wrap.firstChild) body.appendChild(wrap.firstChild);
      bindAddButtons(body);
    } catch {
      loading.remove();
      body.insertAdjacentHTML(
        'beforeend',
        '<div class="msg bot-msg">Oops! I encountered an error. Please try again later.</div>'
      );
    }
    scrollChatToBottom();
  }

  let suggestTimer;
  const suggestBox = document.createElement('div');
  suggestBox.id = 'chat-suggest-box';
  suggestBox.className = 'chat-suggest-box';
  suggestBox.style.display = 'none';

  function hideSuggest() {
    suggestBox.style.display = 'none';
    suggestBox.innerHTML = '';
  }

  async function fetchSuggest(q) {
    if (q.length < 2) {
      hideSuggest();
      return;
    }
    try {
      const res = await fetch(`/api/chat/suggest?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.suggestions?.length) {
        hideSuggest();
        return;
      }
      suggestBox.innerHTML = data.suggestions
        .map(
          (s) =>
            `<button type="button" class="chat-suggest-item" data-q="${escapeHtml(s.query)}">
              <span>${escapeHtml(s.label)}</span>
              <small>${escapeHtml(s.sub)}</small>
            </button>`
        )
        .join('');
      suggestBox.style.display = 'block';
      suggestBox.querySelectorAll('.chat-suggest-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          sendChatMessage(btn.dataset.q);
        });
      });
    } catch {
      hideSuggest();
    }
  }

  window.toggleChat = function toggleChat() {
    const win = document.getElementById('chat-window');
    if (!win) return;
    if (win.style.display === 'none' || win.style.display === '') {
      win.style.display = 'flex';
      requestAnimationFrame(scrollChatToBottom);
    } else {
      win.style.display = 'none';
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const footer = document.querySelector('.chat-footer');

    if (footer && !document.getElementById('chat-suggest-box')) {
      footer.style.position = 'relative';
      footer.appendChild(suggestBox);
    }

    document.querySelectorAll('.chat-quick-chip').forEach((chip) => {
      chip.addEventListener('click', () => sendChatMessage(chip.dataset.msg));
    });

    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
      });
      input.addEventListener('input', () => {
        clearTimeout(suggestTimer);
        suggestTimer = setTimeout(() => fetchSuggest(input.value.trim()), 280);
      });
    }
    if (sendBtn) sendBtn.addEventListener('click', () => sendChatMessage());
  });
})();
