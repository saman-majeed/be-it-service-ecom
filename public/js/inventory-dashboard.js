(function () {
  const data = window.INVENTORY_DATA;
  if (!data || typeof Chart === 'undefined') return;

  const gold = '#c9a86c';
  const goldDark = '#b89558';

  // Category sales — horizontal bar
  if (data.categorySales?.length) {
    const el = document.getElementById('chartCategorySales');
    if (el) {
      new Chart(el, {
        type: 'bar',
        data: {
          labels: data.categorySales.map((c) => c.category),
          datasets: [{
            label: 'Units sold',
            data: data.categorySales.map((c) => c.unitsSold),
            backgroundColor: gold,
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, title: { display: true, text: 'UNITS SOLD' } },
          },
        },
      });
    }
  }

  // Revenue trend — line
  if (data.revenueTrend?.labels?.length) {
    const el = document.getElementById('chartRevenueTrend');
    if (el) {
      new Chart(el, {
        type: 'line',
        data: {
          labels: data.revenueTrend.labels,
          datasets: [{
            label: 'Revenue',
            data: data.revenueTrend.values,
            borderColor: goldDark,
            backgroundColor: 'rgba(201,168,108,0.2)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: goldDark,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } },
        },
      });
    }
  }

  // Stock health filters
  const filterBtns = document.querySelectorAll('#stockFilters button');
  const stockRows = document.querySelectorAll('#stockHealthTable tbody tr[data-filter]');

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter;
      stockRows.forEach((row) => {
        if (f === 'all') {
          row.style.display = '';
        } else if (f === 'critical') {
          row.style.display = row.dataset.filter === 'critical' ? '' : 'none';
        } else if (f === 'out') {
          row.style.display = row.dataset.status === 'OUT' ? '' : 'none';
        }
      });
    });
  });

  // Refresh AI banner
  const btn = document.getElementById('btnRefreshAI');
  const banner = document.getElementById('aiInsightBanner');
  if (btn && banner) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Refreshing…';
      try {
        const res = await fetch('/api/admin/inventory/ai-insights', { method: 'POST' });
        const json = await res.json();
        if (json.success && json.insights?.executiveSummary) {
          banner.textContent = json.insights.executiveSummary;
        }
      } catch (e) {
        console.error(e);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Refresh AI';
      }
    });
  }

  if (window.AI_INSIGHTS?.executiveSummary && banner) {
    banner.textContent = window.AI_INSIGHTS.executiveSummary;
  }
})();
