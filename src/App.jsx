import React, { useState, useEffect } from 'react';

console.log("SUPABASE URL:", import.meta.env.VITE_SUPABASE_URL);

// ============================================================================
// HELPERS
// ============================================================================

const uuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const formatDateTime = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDate = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatTime = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  const h24 = date.getHours();
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${pad(h12)}:${pad(date.getMinutes())} ${ampm}`;
};

const formatPrettyDate = (date) => {
  // e.g. Mon 01 Jan 2026
  const wd = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date);
  const dd = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date);
  const mon = new Intl.DateTimeFormat('en', { month: 'short' }).format(date);
  const yyyy = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(date);
  return `${wd} ${dd} ${mon} ${yyyy}`;
};

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const minutesSinceMidnight = (d) => {
  const x = new Date(d);
  return x.getHours() * 60 + x.getMinutes();
};

// Business date ("day opened") based on opening/closing window.
// Default (00:00 -> 23:59) behaves like normal calendar days.
// If closing_min < opening_min, the window spans midnight and times after midnight
// but before closing_min belong to the previous calendar day.
const computeBusinessDateFromDate = (saleDateTime, settings) => {
  const openMin = Number(settings?.opening_min ?? 0);
  const closeMin = Number(settings?.closing_min ?? (23 * 60 + 59));
  const m = minutesSinceMidnight(saleDateTime);
  const spansMidnight = closeMin < openMin;

  // Only shift in the spans-midnight case (this matches the user's requirement).
  if (spansMidnight && m <= closeMin) {
    const prev = new Date(saleDateTime);
    prev.setDate(prev.getDate() - 1);
    return formatDate(prev);
  }
  return formatDate(saleDateTime);
};

const formatMoney = (amount) => {
  return Number(amount).toFixed(2);
};

const parseNumber = (value, fallback = 0) => {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
};

const exportCSV = (records, filename) => {
  // Raw export (snapshot-based). Keep stable columns; append new fields at the end.
  const header = 'entry_id,business_date,sale_time_local,sale_timestamp_local,item_id,item_label,category_path,unit_price,quantity,total_price,payment_method,customer_name,is_void,void_reason,created_at_local,created_at_epoch_ms,sale_time_epoch_ms\n';
  const rows = records.map(r => {
    return [
      r.entry_id,
      r.business_date,
      r.sale_time_local,
      r.sale_timestamp_local,
      r.item_id,
      `"${r.item_label}"`,
      `"${r.category_path}"`,
      r.unit_price || 0,
      r.quantity,
      r.total_price || 0,
      r.payment_method || 'cash',
      `"${(r.customer_name || '').replace(/"/g, '""')}"`,
      r.is_void,
      `"${r.void_reason}"`,
      r.created_at_local,
      r.created_at_epoch_ms,
      r.sale_time_epoch_ms
    ].join(',');
  }).join('\n');
  
  const csv = header + rows;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ============================================================================
// DEFAULT SEED DATA
// ============================================================================

const DEFAULT_CATEGORIES = [
  { id: 'K', label: 'K', parent_id: null, sort_order: 1, is_active: 1 },
  { id: 'K_Kava', label: 'Kava', parent_id: 'K', sort_order: 1, is_active: 1 },
  { id: 'C', label: 'C', parent_id: null, sort_order: 2, is_active: 1 }
];

const DEFAULT_ITEMS = [
  { id: 'kava_strong', label: 'Kava Strong', category_id: 'K_Kava', unit_price: 25.0, sort_order: 1, is_active: 1 },
  { id: 'kava_light', label: 'Kava Light', category_id: 'K_Kava', unit_price: 20.0, sort_order: 2, is_active: 1 },
  { id: 'coffee', label: 'Coffee', category_id: 'C', unit_price: 15.0, sort_order: 1, is_active: 1 },
  { id: 'tea', label: 'Tea', category_id: 'C', unit_price: 10.0, sort_order: 2, is_active: 1 }
];

// ============================================================================
// LOCAL STORAGE
// ============================================================================

const STORAGE_KEY_RECORDS = 'sales_records';
const STORAGE_KEY_CATEGORIES = 'sales_menu_categories';
const STORAGE_KEY_ITEMS = 'sales_menu_items';
const STORAGE_KEY_SETTINGS = 'sales_settings';

const DEFAULT_SETTINGS = {
  // Minutes since midnight
  opening_min: 0,            // 12:00 AM
  closing_min: 23 * 60 + 59  // 11:59 PM
};

const loadRecords = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_RECORDS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

const saveRecords = (records) => {
  localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
};

const loadCategories = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (data) {
      return JSON.parse(data);
    } else {
      // First run - seed with defaults
      localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
      return DEFAULT_CATEGORIES;
    }
  } catch (e) {
    return DEFAULT_CATEGORIES;
  }
};

const saveCategories = (categories) => {
  localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
};

const loadItems = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_ITEMS);
    if (data) {
      return JSON.parse(data);
    } else {
      // First run - seed with defaults
      localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(DEFAULT_ITEMS));
      return DEFAULT_ITEMS;
    }
  } catch (e) {
    return DEFAULT_ITEMS;
  }
};

const saveItems = (items) => {
  localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items));
};

const loadSettings = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (data) {
      const parsed = JSON.parse(data);
      return {
        opening_min: Number.isFinite(parsed.opening_min) ? parsed.opening_min : DEFAULT_SETTINGS.opening_min,
        closing_min: Number.isFinite(parsed.closing_min) ? parsed.closing_min : DEFAULT_SETTINGS.closing_min
      };
    }
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    return DEFAULT_SETTINGS;
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
};

const saveSettings = (settings) => {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function SalesRecorder() {
  // --------------------------------------------------------------------------
  // VIEWPORT / DESKTOP WRAP
  // --------------------------------------------------------------------------
  const [isWide, setIsWide] = useState(() => {
    try {
      return window.innerWidth >= 720;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Make the app look consistent when deployed inside a normal webpage.
    // (Avoid default browser margins and body background clashes.)
    try {
      document.body.style.margin = '0';
      document.body.style.backgroundColor = '#e9eef3';
      document.documentElement.style.height = '100%';
      document.body.style.minHeight = '100%';
      document.body.style.width = '100%';
      document.body.style.overflowX = 'hidden';
    } catch {}

    const onResize = () => {
      try {
        setIsWide(window.innerWidth >= 720);
      } catch {}
    };
    try {
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    } catch {
      return undefined;
    }
  }, []);

  // Root container style that behaves well on desktop browsers.
  const shellStyle = isWide ? { ...styles.container, ...styles.containerWide } : styles.container;
  const [screen, setScreen] = useState('entry'); // entry, menu, table, sales, manage_items, settings
  const [records, setRecords] = useState(loadRecords());
  const [categories, setCategories] = useState(loadCategories());
  const [items, setItems] = useState(loadItems());
  const [settings, setSettings] = useState(loadSettings());
  
  const [autoTime, setAutoTime] = useState(true);
  const [manualHour12, setManualHour12] = useState(() => {
    const h24 = new Date().getHours();
    return h24 % 12 === 0 ? 12 : h24 % 12;
  });
  const [manualMinute, setManualMinute] = useState(() => new Date().getMinutes());
  const [manualAmPm, setManualAmPm] = useState(() => (new Date().getHours() >= 12 ? 'PM' : 'AM'));
  const [currentTime, setCurrentTime] = useState(new Date());

  const [autoDate, setAutoDate] = useState(true);
  const [manualDate, setManualDate] = useState(startOfDay(new Date()));
  
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [showPicker, setShowPicker] = useState(false);
  const [toast, setToast] = useState('');

  // Sales screen (daily ledger)
  const [salesDate, setSalesDate] = useState(startOfDay(new Date()));
  const [salesSortAsc, setSalesSortAsc] = useState(true);
  const [salesBalanceMode, setSalesBalanceMode] = useState('all'); // all | cash
  const [salesEditing, setSalesEditing] = useState(null);
  const [showSalesEditModal, setShowSalesEditModal] = useState(false);

  // Tap the bottom preview to edit the draft sale and confirm/cancel from the modal
  const [showDraftModal, setShowDraftModal] = useState(false);
  
  const [editingRecord, setEditingRecord] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Auto-update current time
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync to localStorage
  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    saveCategories(categories);
  }, [categories]);

  useEffect(() => {
    saveItems(items);
  }, [items]);
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const getCategoryPathById = (categoryId) => {
    if (!categoryId) return 'Root';
    const map = new Map(categories.map(c => [c.id, c]));
    const parts = [];
    let cur = map.get(categoryId);
    const guard = new Set();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      parts.unshift(cur.label);
      cur = cur.parent_id ? map.get(cur.parent_id) : null;
    }
    return parts.join(' > ') || 'Root';
  };

  const getActiveItemsWithPaths = () => {
    return items
      .filter(i => i.is_active)
      .slice()
      .sort((a, b) => {
        const ap = getCategoryPathById(a.category_id);
        const bp = getCategoryPathById(b.category_id);
        if (ap !== bp) return ap.localeCompare(bp);
        return (a.sort_order - b.sort_order) || a.label.localeCompare(b.label);
      })
      .map(i => ({
        ...i,
        categoryPath: getCategoryPathById(i.category_id),
        fullLabel: `${getCategoryPathById(i.category_id)} > ${i.label}`
      }));
  };

  const getDisplayTimeParts = () => {
    const pad = (n) => String(n).padStart(2, '0');

    if (autoTime) {
      const h24 = currentTime.getHours();
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const mm = currentTime.getMinutes();
      return {
        hourStr: pad(h12),
        minuteStr: pad(mm),
        ampm,
        full: `${pad(h12)}:${pad(mm)} ${ampm}`
      };
    }

    return {
      hourStr: pad(manualHour12),
      minuteStr: pad(manualMinute),
      ampm: manualAmPm,
      full: `${pad(manualHour12)}:${pad(manualMinute)} ${manualAmPm}`
    };
  };

  const getDisplayDate = () => {
    return autoDate ? startOfDay(currentTime) : manualDate;
  };

  const handleDateAdjust = (deltaDays) => {
    if (autoDate) {
      setManualDate(startOfDay(currentTime));
      setAutoDate(false);
    }
    setManualDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + deltaDays);
      return startOfDay(d);
    });
  };

  const handleTimeAdjust = (type, delta) => {
    if (autoTime) {
      const h24 = currentTime.getHours();
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      setManualHour12(h12);
      setManualMinute(currentTime.getMinutes());
      setManualAmPm(ampm);
      setAutoTime(false);
    }

    if (type === 'hour') {
      setManualHour12((prev) => {
        let next = prev + delta;
        while (next < 1) next += 12;
        while (next > 12) next -= 12;
        return next;
      });
    } else if (type === 'minute') {
      setManualMinute((prev) => (prev + delta + 60) % 60);
    } else if (type === 'ampm') {
      setManualAmPm((prev) => (prev === 'AM' ? 'PM' : 'AM'));
    }
  };

  const finalizeSale = ({ h12, min, ampm, itemId, itemLabel = '', unitPrice, qty, paymentMethod = 'cash', customerName = '' }) => {
    const activeItems = getActiveItemsWithPaths();
    const norm = (x) => String(x || '').trim().toLowerCase();
    const typed = String(itemLabel || '').trim();

    const chosen =
      activeItems.find(i => i.id === itemId) ||
      (typed ? activeItems.find(i => norm(i.label) === norm(typed) || norm(i.fullLabel) === norm(typed)) : null);

    // Allow manual (free-typed) items even if they don't exist in Manage Items.
    if (!chosen && !typed) return;

    const now = new Date();
    const baseDate = getDisplayDate();
    const hour24 = ampm === 'AM' ? (h12 % 12) : (h12 % 12) + 12;
    const saleTime = new Date(baseDate);
    saleTime.setHours(hour24, min, 0, 0);

    const price = Number(unitPrice) || 0;
    const q = Math.max(1, Number(qty) || 1);
    const totalPrice = price * q;

    const record = {
      entry_id: uuid(),
      business_date: computeBusinessDateFromDate(saleTime, settings),
      sale_time_local: formatTime(saleTime),
      sale_timestamp_local: `${formatDate(saleTime)} ${formatTime(saleTime)}`,
      item_id: chosen ? chosen.id : '',
      item_label: chosen ? chosen.label : typed,
      category_path: chosen ? chosen.categoryPath : 'Manual',
      unit_price: price,
      quantity: q,
      total_price: totalPrice,
      payment_method: paymentMethod || 'cash',
      customer_name: customerName || '',
      is_void: 0,
      void_reason: '',
      created_at_local: formatDateTime(now),
      created_at_epoch_ms: now.getTime(),
      sale_time_epoch_ms: saleTime.getTime()
    };

    setRecords(prev => [...prev, record]);

    // Reset draft
    setSelectedItem(null);
    setQuantity(1);
    setAutoTime(true);
    setAutoDate(true);
    setShowDraftModal(false);

    setToast('Saved');
    setTimeout(() => setToast(''), 2000);
  };

  const getDraftTimeNumeric = () => {
    if (autoTime) {
      const h24 = currentTime.getHours();
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return { h12, min: currentTime.getMinutes(), ampm };
    }
    return { h12: manualHour12, min: manualMinute, ampm: manualAmPm };
  };

  const handleConfirm = () => {
    if (!selectedItem) return;
    const t = getDraftTimeNumeric();
    finalizeSale({
      h12: t.h12,
      min: t.min,
      ampm: t.ampm,
      itemId: selectedItem.id,
      unitPrice: selectedItem.unit_price || 0,
      qty: quantity,
      paymentMethod: 'cash',
      customerName: ''
    });
  };

  const handleCancel = () => {
    setSelectedItem(null);
    setQuantity(1);
    setAutoTime(true);
    setAutoDate(true);
    setShowDraftModal(false);
  };

  const handleVoid = (entryId) => {
    setRecords(records.map(r => 
      r.entry_id === entryId ? { ...r, is_void: 1, void_reason: 'Voided' } : r
    ));
  };

  const handleEdit = (record) => {
    setEditingRecord({...record});
    setShowEditModal(true);
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all data? This cannot be undone.')) {
      setRecords([]);
      setScreen('entry');
    }
  };

  const handleExportToday = () => {
    const today = formatDate(new Date());
    const todayRecords = records.filter(r => r.business_date === today);
    if (todayRecords.length === 0) {
      alert('No records for today');
      return;
    }
    exportCSV(todayRecords, `sales_${today}.csv`);
  };

  // ============================================================================
  // RENDER SCREENS
  // ============================================================================

  if (screen === 'menu') {
    return (
      <div style={shellStyle}>
        <div style={styles.header}>
          <button style={styles.headerBtn} onClick={() => setScreen('entry')}>BACK</button>
        </div>
        <div style={styles.menuContent}>
          <button style={styles.menuItem} onClick={() => setScreen('entry')}>New Entry</button>
          <button style={styles.menuItem} onClick={() => setScreen('table')}>Table</button>
          <button style={styles.menuItem} onClick={() => { setSalesDate(startOfDay(new Date())); setScreen('sales'); }}>Sales</button>
          <button style={styles.menuItem} onClick={() => setScreen('manage_items')}>Manage Items</button>
          <button style={styles.menuItem} onClick={() => setScreen('settings')}>Settings</button>
          <button style={styles.menuItem} onClick={handleExportToday}>Export CSV (Today)</button>
          <button style={{...styles.menuItem, ...styles.dangerBtn}} onClick={handleClearAll}>Clear All Data</button>
        </div>
      </div>
    );
  }

  if (screen === 'table') {
    const today = formatDate(new Date());
    const todayRecords = records
      .filter(r => r.business_date === today)
      .sort((a, b) => b.sale_time_epoch_ms - a.sale_time_epoch_ms);
    
    const totalEntries = todayRecords.filter(r => !r.is_void).length;
    const totalQuantity = todayRecords.filter(r => !r.is_void).reduce((sum, r) => sum + r.quantity, 0);
    const totalSales = todayRecords.filter(r => !r.is_void).reduce((sum, r) => sum + (r.total_price || 0), 0);

    return (
      <div style={shellStyle}>
        {showEditModal && editingRecord && (
          <EditModal
            record={editingRecord}
            items={items}
            categories={categories}
            onSave={(updatedRecord) => {
              const now = new Date();
              const updated = {
                ...updatedRecord,
                updated_at_epoch_ms: now.getTime(),
                updated_at_local: formatDateTime(now)
              };
              setRecords(records.map(r => r.entry_id === updated.entry_id ? updated : r));
              setShowEditModal(false);
              setEditingRecord(null);
              setToast('Updated');
              setTimeout(() => setToast(''), 2000);
            }}
            onCancel={() => {
              setShowEditModal(false);
              setEditingRecord(null);
            }}
          />
        )}
        
        <div style={styles.header}>
          <button style={styles.headerBtn} onClick={() => setScreen('entry')}>BACK</button>
          <div style={styles.headerTitle}>Table</div>
          <button style={styles.headerBtn} onClick={handleExportToday}>EXPORT</button>
        </div>
        <div style={styles.tableContent}>
          <div style={styles.summary}>
            Entries: {totalEntries} | Qty: {totalQuantity} | Sales: ${formatMoney(totalSales)}
          </div>
          <div style={styles.recordList}>
            {todayRecords.length === 0 ? (
              <div style={styles.emptyState}>No records for today</div>
            ) : (
              todayRecords.map(record => (
                <div 
                  key={record.entry_id} 
                  style={{
                    ...styles.recordRow,
                    ...(record.is_void ? styles.voidRow : {})
                  }}
                >
                  <div style={styles.recordMain}>
                    <div style={styles.recordTime}>{record.sale_time_local}</div>
                    <div style={styles.recordItem}>
                      {record.item_label}
                      {record.is_void && <span style={styles.voidBadge}> VOID</span>}
                    </div>
                    <div style={styles.recordPrice}>
                      ${formatMoney(record.unit_price || 0)} × {record.quantity} = ${formatMoney(record.total_price || 0)}
                    </div>
                  </div>
                  <div style={styles.recordActions}>
                    {!record.is_void && (
                      <>
                        <button 
                          style={styles.actionBtn} 
                          onClick={() => handleEdit(record)}
                        >
                          Edit
                        </button>
                        <button 
                          style={{...styles.actionBtn, ...styles.voidBtn}} 
                          onClick={() => handleVoid(record.entry_id)}
                        >
                          Void
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {toast && <div style={styles.toast}>{toast}</div>}
      </div>
    );
  }

  if (screen === 'sales') {
    const day = formatDate(salesDate);
    const dayRecords = records
      .filter(r => {
        const ms = Number(r.sale_time_epoch_ms || 0);
        if (!ms) return r.business_date === day;
        const eff = computeBusinessDateFromDate(new Date(ms), settings);
        return eff === day;
      })
      .filter(r => !r.is_void)
      .slice();

    dayRecords.sort((a, b) => {
      return salesSortAsc
        ? a.sale_time_epoch_ms - b.sale_time_epoch_ms
        : b.sale_time_epoch_ms - a.sale_time_epoch_ms;
    });

    let running = 0;
    const ledgerRows = dayRecords.map(r => {
      const isCredit = (r.payment_method || 'cash') === 'credit';
      const include = salesBalanceMode === 'all' ? true : !isCredit;
      if (include) running += Number(r.total_price || 0);
      return {
        ...r,
        __running_balance: running,
        __is_credit: isCredit
      };
    });

    const exportSalesDayCSV = () => {
      const header = 'time,item,unit_price,quantity,total_price,running_balance,payment_method,customer_name\n';
      const rows = ledgerRows
        .map(r => [
          r.sale_time_local,
          `"${String(r.item_label || '').replace(/"/g, '""')}"`,
          Number(r.unit_price || 0),
          Number(r.quantity || 0),
          Number(r.total_price || 0),
          Number(r.__running_balance || 0),
          r.payment_method || 'cash',
          `"${String(r.customer_name || '').replace(/"/g, '""')}"`
        ].join(','))
        .join('\n');
      const csv = header + rows;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales_${day}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const shiftSalesDate = (deltaDays) => {
      const d = new Date(salesDate);
      d.setDate(d.getDate() + deltaDays);
      setSalesDate(startOfDay(d));
    };

    const totalQty = ledgerRows.reduce((s, r) => s + Number(r.quantity || 0), 0);
    const totalAmt = ledgerRows.reduce((s, r) => s + Number(r.total_price || 0), 0);

    return (
      <div style={shellStyle}>
        {showSalesEditModal && salesEditing && (
          <SalesEditModal
            record={salesEditing}
            categories={categories}
            items={items}
            onConfirm={(patch) => {
              // patch: { itemId?, itemLabel, unitPrice, quantity, customerName, paymentMethod }
              const typedLabel = String(patch.itemLabel || '').trim();
              const price = Number(patch.unitPrice) || 0;
              const qty = Math.max(1, Number(patch.quantity) || 1);
              const total = price * qty;

              // If the typed label matches an existing active item, link to it.
              const active = getActiveItemsWithPaths();
              const norm = (x) => String(x || '').trim().toLowerCase();
              const chosen = active.find(i => i.id === patch.itemId)
                || active.find(i => norm(i.label) == norm(typedLabel))
                || active.find(i => norm(`${i.categoryPath} > ${i.label}`) == norm(typedLabel));

              const updated = {
                ...salesEditing,
                item_id: chosen ? chosen.id : '',
                item_label: chosen ? chosen.label : typedLabel,
                category_path: chosen ? chosen.categoryPath : 'Manual',
                unit_price: price,
                quantity: qty,
                total_price: total,
                customer_name: patch.customerName || '',
                payment_method: patch.paymentMethod || 'cash',
                updated_at_epoch_ms: Date.now(),
                updated_at_local: formatDateTime(new Date())
              };

              // Require an item label (either from menu or manual)
              if (!String(updated.item_label || '').trim()) {
                setToast('Item required');
                setTimeout(() => setToast(''), 2000);
                return;
              }

              setRecords(prev => prev.map(r => r.entry_id === updated.entry_id ? updated : r));
              setShowSalesEditModal(false);
              setSalesEditing(null);
              setToast('Updated');
              setTimeout(() => setToast(''), 2000);
            }}
            onCancel={() => {
              setShowSalesEditModal(false);
              setSalesEditing(null);
            }}
            onDelete={() => {
              // NOTE: Avoid window.confirm() because some embedded preview environments block it,
              // making the Delete button appear to do nothing.
              setRecords(prev => prev.filter(r => r.entry_id !== salesEditing.entry_id));
              setShowSalesEditModal(false);
              setSalesEditing(null);
              setToast('Deleted');
              setTimeout(() => setToast(''), 2000);
            }}
          />
        )}

        <div style={styles.header}>
          <button style={styles.headerBtn} onClick={() => setScreen('menu')}>BACK</button>
          <div style={styles.headerTitle}>Sales</div>
          <button style={styles.headerBtn} onClick={exportSalesDayCSV}>CSV</button>
        </div>

        <div style={styles.salesContent}>
          <div style={styles.sectionDate}>
            <button style={styles.dateBtn} onClick={() => shiftSalesDate(-1)}>−</button>
            <div style={styles.dateValue}>{formatPrettyDate(salesDate)}</div>
            <button style={styles.dateBtn} onClick={() => shiftSalesDate(1)}>+</button>
          </div>

          <div style={styles.salesFilters}>
            <div style={styles.salesFilterLabel}>Running balance:</div>
            <button
              style={{ ...styles.smallPill, ...(salesBalanceMode === 'all' ? styles.smallPillActive : {}) }}
              onClick={() => setSalesBalanceMode('all')}
            >
              Cash + Credit
            </button>
            <button
              style={{ ...styles.smallPill, ...(salesBalanceMode === 'cash' ? styles.smallPillActive : {}) }}
              onClick={() => setSalesBalanceMode('cash')}
            >
              Cash only
            </button>
          </div>

          <div style={styles.salesTableWrap}>
            <div style={styles.salesHeaderRow}>
              <button
                style={styles.salesHeaderCellTime}
                onClick={() => setSalesSortAsc(v => !v)}
              >
                Time {salesSortAsc ? '▲' : '▼'}
              </button>
              <div style={styles.salesHeaderCell}>Item</div>
              <div style={styles.salesHeaderCellRight}>Qty</div>
              <div style={styles.salesHeaderCellRight}>Total</div>
              <div style={styles.salesHeaderCellRight}>Balance</div>
            </div>

            {ledgerRows.length === 0 ? (
              <div style={styles.emptyState}>No sales for this day</div>
            ) : (
              ledgerRows.map(r => (
                <div
                  key={r.entry_id}
                  style={{
                    ...styles.salesRow,
                    ...(r.__is_credit ? styles.creditRow : {})
                  }}
                  onClick={() => {
                    setSalesEditing({ ...r });
                    setShowSalesEditModal(true);
                  }}
                  role="button"
                >
                  <div style={styles.salesCellTime}>{r.sale_time_local}</div>
                  <div style={styles.salesCellItem}>
                    <div style={styles.salesItemLabel}>{r.item_label}</div>
                    {(r.payment_method || 'cash') === 'credit' && (
                      <div style={styles.salesCreditTag}>CREDIT</div>
                    )}
                  </div>
                  <div style={styles.salesCellRight}>{r.quantity}</div>
                  <div style={styles.salesCellRight}>${formatMoney(r.total_price || 0)}</div>
                  <div style={styles.salesCellRight}>${formatMoney(r.__running_balance || 0)}</div>
                </div>
              ))
            )}
          </div>

          <div style={styles.salesFooter}>
            <div style={styles.salesFooterText}>Rows: {ledgerRows.length} · Qty: {totalQty} · Total: ${formatMoney(totalAmt)}</div>
          </div>
        </div>

        {toast && <div style={styles.toast}>{toast}</div>}
      </div>
    );
  }

  if (screen === 'manage_items') {
    return (
      <ManageItemsScreen
        shellStyle={shellStyle}
        categories={categories}
        items={items}
        onUpdateCategories={setCategories}
        onUpdateItems={setItems}
        onBack={() => setScreen('menu')}
        onToast={(msg) => {
          setToast(msg);
          setTimeout(() => setToast(''), 2000);
        }}
      />
    );
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        shellStyle={shellStyle}
        settings={settings}
        onUpdate={setSettings}
        onBack={() => setScreen('menu')}
      />
    );
  }

  // Entry Screen
  return (
    <div style={shellStyle}>
      {showDraftModal && selectedItem && (
        <DraftSaleModal
          categories={categories}
          items={items}
          initial={{
            itemId: selectedItem.id,
            itemLabel: selectedItem.label,
            unitPrice: selectedItem.unit_price || 0,
            quantity: quantity,
            customerName: '',
            paymentMethod: 'cash'
          }}
          onConfirm={({ itemId, itemLabel, unitPrice, quantity, customerName, paymentMethod }) => {
            const t = getDraftTimeNumeric();
            finalizeSale({
              h12: t.h12,
              min: t.min,
              ampm: t.ampm,
              itemId,
              itemLabel,
              unitPrice,
              qty: quantity,
              customerName,
              paymentMethod
            });
          }}
          onCancel={() => {
            // Cancel from modal cancels the whole sale
            handleCancel();
          }}
          onClose={() => setShowDraftModal(false)}
        />
      )}
      {showPicker && (
        <ItemPicker
          categories={categories}
          items={items}
          onSelect={(item) => {
            setSelectedItem(item);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
      
      {/* Original (Claude-style) layout, tightened up, with + above time and − below */}
      <div style={styles.header}>
        <button style={styles.headerBtn} onClick={() => setScreen('menu')}>MENU</button>
        <div style={styles.headerTitle}>Sales Recorder</div>
        <div style={{ width: 74 }} />
      </div>

      <div style={styles.entryContentTight}>
        {/* DATE (very compact) */}
        <div style={styles.sectionDate}>
          <button style={styles.dateBtn} onClick={() => handleDateAdjust(-1)}>−</button>
          <div style={styles.dateValue}>{formatPrettyDate(getDisplayDate())}</div>
          <button style={styles.dateBtn} onClick={() => handleDateAdjust(1)}>+</button>
        </div>

        {/* TIME (compact) */}
        <div style={{ ...styles.sectionTight, ...styles.timeSectionCompact }}>
          <div style={styles.timeControlsTight}>
            <div style={styles.timeColumnTight}>
              <button style={styles.timeBtnTight} onClick={() => handleTimeAdjust('hour', 1)}>+</button>
              <div style={styles.timeMidBox}>
                <div style={styles.timeMidValue}>{getDisplayTimeParts().hourStr}</div>
              </div>
              <button style={styles.timeBtnTight} onClick={() => handleTimeAdjust('hour', -1)}>−</button>
            </div>
            <div style={styles.timeColumnTight}>
              <button style={styles.timeBtnTight} onClick={() => handleTimeAdjust('minute', 1)}>+</button>
              <div style={styles.timeMidBox}>
                <div style={styles.timeMidValue}>{getDisplayTimeParts().minuteStr}</div>
              </div>
              <button style={styles.timeBtnTight} onClick={() => handleTimeAdjust('minute', -1)}>−</button>
            </div>
            <div style={styles.timeColumnTight}>
              <button style={styles.timeBtnTight} onClick={() => handleTimeAdjust('ampm', 1)}>+</button>
              <div style={styles.timeMidBox}>
                <div style={styles.timeMidValue}>{getDisplayTimeParts().ampm}</div>
              </div>
              <button style={styles.timeBtnTight} onClick={() => handleTimeAdjust('ampm', -1)}>−</button>
            </div>
          </div>
        </div>

        {/* ITEM (takes most space) */}
        <div style={{ ...styles.sectionTight, ...styles.itemSectionGrow }}>
          <div style={styles.itemAreaTight}>
            {selectedItem ? (
              <div style={styles.itemSelectedCard}>
                <div style={styles.itemTitle2}>{selectedItem.label}</div>
                <div style={styles.itemMeta2}>${formatMoney(selectedItem.unit_price || 0)} · {selectedItem.categoryPath}</div>
                <div style={styles.qtyInlineDisplay}>Qty: {quantity}</div>
                <div style={styles.itemActionsRow2}>
                  <button style={styles.qtyInlineBtn} onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
<button style={styles.confirmInlineBtn} onClick={handleConfirm}>CONFIRM</button>
<button style={styles.cancelInlineBtn} onClick={handleCancel}>CANCEL</button>
<button style={styles.qtyInlineBtn} onClick={() => setQuantity(quantity + 1)}>+</button>
</div>
              </div>
            ) : (
              <button style={styles.itemBigBtn} onClick={() => setShowPicker(true)}>Select Item</button>
            )}
          </div>
        </div>

        {/* PREVIEW */}
        <div
          style={{
            ...styles.previewTight,
            ...(selectedItem ? styles.previewClickable : {}),
          }}
          onClick={() => {
            if (selectedItem) setShowDraftModal(true);
          }}
          role={selectedItem ? 'button' : undefined}
          aria-label={selectedItem ? 'Edit draft sale' : undefined}
        >
          {selectedItem
            ? `${getDisplayTimeParts().full} · ${selectedItem.label} × ${quantity} = $${formatMoney((selectedItem.unit_price || 0) * quantity)}`
            : `${getDisplayTimeParts().full} · Select an item`}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={styles.toast}>{toast}</div>
      )}
    </div>
  );
}

// ============================================================================
// ITEM PICKER COMPONENT
// ============================================================================

function ItemPicker({ categories, items, onSelect, onClose }) {
  const [breadcrumb, setBreadcrumb] = useState([]);

  const currentCategoryId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null;

  const activeCategories = categories.filter(c => c.is_active);
  const activeItems = items.filter(i => i.is_active);

  const childCategories = activeCategories
    .filter(cat => cat.parent_id === currentCategoryId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const childItems = activeItems
    .filter(item => item.category_id === currentCategoryId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const handleCategoryClick = (category) => {
    setBreadcrumb([...breadcrumb, category]);
  };

  const handleItemClick = (item) => {
    const pathParts = breadcrumb.map(c => c.label);
    const categoryPath = pathParts.join(' > ') || item.category_id;
    onSelect({
      id: item.id,
      label: item.label,
      categoryPath: categoryPath,
      unit_price: item.unit_price
    });
  };

  const handleBack = () => {
    if (breadcrumb.length > 0) {
      setBreadcrumb(breadcrumb.slice(0, -1));
    } else {
      onClose();
    }
  };

  return (
    <div style={styles.pickerOverlay}>
      <div style={styles.pickerContainer}>
        <div style={styles.pickerHeader}>
          <button style={styles.pickerBackBtn} onClick={handleBack}>
            {breadcrumb.length > 0 ? 'BACK' : 'CLOSE'}
          </button>
          <div style={styles.pickerTitle}>
            {breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].label : 'Select Item'}
          </div>
        </div>
        <div style={styles.pickerContent}>
          {childCategories.map(cat => (
            <button 
              key={cat.id} 
              style={styles.pickerCategoryBtn}
              onClick={() => handleCategoryClick(cat)}
            >
              {cat.label} →
            </button>
          ))}
          {childItems.map(item => (
            <button 
              key={item.id} 
              style={styles.pickerItemBtn}
              onClick={() => handleItemClick(item)}
            >
              {item.label} · ${formatMoney(item.unit_price)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DRAFT SALE MODAL (from Entry screen preview)
// ============================================================================

function DraftSaleModal({ categories, items, initial, onConfirm, onCancel, onClose }) {
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const escapeCsv = (s) => String(s ?? '').replace(/"/g, '""');

  const buildCategoryPath = (categoryId) => {
    if (!categoryId) return 'Root';
    const map = new Map(categories.map(c => [c.id, c]));
    const parts = [];
    let cur = map.get(categoryId);
    const guard = new Set();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      parts.unshift(cur.label);
      cur = cur.parent_id ? map.get(cur.parent_id) : null;
    }
    return parts.join(' > ') || 'Root';
  };

  const activeItems = items
    .filter(i => i.is_active)
    .slice()
    .sort((a, b) => {
      const ap = buildCategoryPath(a.category_id);
      const bp = buildCategoryPath(b.category_id);
      if (ap !== bp) return ap.localeCompare(bp);
      return (a.sort_order - b.sort_order) || a.label.localeCompare(b.label);
    })
    .map(i => ({
      ...i,
      categoryPath: buildCategoryPath(i.category_id),
      displayLabel: `${buildCategoryPath(i.category_id)} > ${i.label}`
    }));

  const [itemId, setItemId] = useState(initial.itemId || (activeItems[0]?.id ?? ''));
  const [unitPrice, setUnitPrice] = useState(String(initial.unitPrice ?? 0));
  const [qty, setQty] = useState(initial.quantity || 1);
  const [customerName, setCustomerName] = useState(initial.customerName || '');
  const [paymentMethod, setPaymentMethod] = useState(initial.paymentMethod || 'cash');

  // Manual item label (free-typed). Allows items that do not exist in Manage Items.
  const [itemLabel, setItemLabel] = useState(() => {
    const initId = initial.itemId || (activeItems[0]?.id ?? '');
    const initItem = activeItems.find(i => i.id === initId);
    return String(initial.itemLabel ?? initItem?.label ?? '').trim();
  });

  // Keep unit price synced when item changes (user can still override after)
  useEffect(() => {
    const it = activeItems.find(x => x.id === itemId);
    if (!it) return;
    // If unitPrice currently equals initial unit price or equals previous item's default, update it.
    // Keep it simple: if user hasn't typed (unitPrice === String(initial.unitPrice)), update.
    // Otherwise leave as user override.
    if (String(unitPrice) === String(initial.unitPrice ?? 0)) {
      setUnitPrice(String(it.unit_price ?? 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const selected = activeItems.find(i => i.id === itemId);
  const safeQty = clamp(Number(qty) || 1, 1, 9999);
  const safePrice = Number(unitPrice) || 0;
  const total = safeQty * safePrice;

  const confirm = () => {
    const typed = String(itemLabel || '').trim();
    if (!typed) return;

    // If the typed label matches an existing active item, link to it.
    const norm = (x) => String(x || '').trim().toLowerCase();
    const exact = activeItems.find(x => norm(x.label) === norm(typed))
      || activeItems.find(x => norm(x.displayLabel) === norm(typed));

    onConfirm({
      itemId: exact ? exact.id : (selected ? selected.id : ''),
      itemLabel: exact ? exact.label : typed,
      unitPrice: safePrice,
      quantity: safeQty,
      customerName: customerName.trim(),
      paymentMethod
    });
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>Edit Sale</div>
        </div>
        <div style={{ ...styles.modalContent, paddingTop: 10 }}>
          {/* Customer + Payment */}
          <div style={styles.draftGridRow2}>
            <div style={{ ...styles.modalField, marginBottom: 0 }}>
              <div style={styles.modalLabel}>Customer</div>
              <input
                style={styles.modalInput}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="(optional)"
              />
            </div>
            <div style={{ ...styles.modalField, marginBottom: 0 }}>
              <div style={styles.modalLabel}>Payment</div>
              <div style={styles.radioRow}>
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === 'cash'}
                    onChange={() => setPaymentMethod('cash')}
                  />
                  <span style={styles.radioText}>Cash</span>
                </label>
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === 'credit'}
                    onChange={() => setPaymentMethod('credit')}
                  />
                  <span style={styles.radioText}>Credit</span>
                </label>
              </div>
            </div>
          </div>

          {/* Item (free-typed) */}
          <div style={styles.modalField}>
            <div style={styles.modalLabel}>Item</div>
            <input
              style={styles.modalInput}
              value={itemLabel}
              onChange={(e) => {
                const v = e.target.value;
                setItemLabel(v);

                // If user types an exact known item label/path, pre-fill unit price and link it.
                const typed = String(v || '').trim();
                const norm = (x) => String(x || '').trim().toLowerCase();
                const exact = activeItems.find(x => norm(x.label) === norm(typed))
                  || activeItems.find(x => norm(x.displayLabel) === norm(typed));

                if (exact) {
                  setItemId(exact.id);
                  setUnitPrice(String(exact.unit_price ?? 0));
                } else {
                  // Manual item (not in Manage Items)
                  setItemId('');
                }
              }}
              placeholder="Type any item"
            />
          </div>

          {/* Unit price + qty */}
          <div style={styles.draftGridRow2}>
            <div style={{ ...styles.modalField, marginBottom: 0 }}>
              <div style={styles.modalLabel}>Unit price</div>
              <input
                style={styles.modalInput}
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
            <div style={{ ...styles.modalField, marginBottom: 0 }}>
              <div style={styles.modalLabel}>Qty</div>
              <div style={styles.qtyRowInline}>
                <button style={styles.qtyInlineBtn} onClick={() => setQty(clamp(safeQty - 1, 1, 9999))}>−</button>
                <div style={styles.qtyInlineValue}>{safeQty}</div>
                <button style={styles.qtyInlineBtn} onClick={() => setQty(clamp(safeQty + 1, 1, 9999))}>+</button>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={styles.draftPreviewLine}>
            {(paymentMethod === 'credit' ? 'CREDIT' : 'CASH')} · {(selected ? selected.label : itemLabel).trim()} × {safeQty} = ${formatMoney(total)}
          </div>
        </div>

        <div style={styles.modalActions}>
          <button style={styles.confirmInlineBtn} onClick={confirm}>CONFIRM</button>
          <button style={styles.cancelInlineBtn} onClick={onCancel}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SALES EDIT MODAL (for existing records)
// ============================================================================

function SalesEditModal({ record, categories, items, onConfirm, onCancel, onDelete }) {
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const buildCategoryPath = (categoryId) => {
    if (!categoryId) return 'Root';
    const map = new Map(categories.map(c => [c.id, c]));
    const parts = [];
    let cur = map.get(categoryId);
    const guard = new Set();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      parts.unshift(cur.label);
      cur = cur.parent_id ? map.get(cur.parent_id) : null;
    }
    return parts.join(' > ') || 'Root';
  };

  const activeItems = items
    .filter(i => i.is_active)
    .slice()
    .sort((a, b) => {
      const ap = buildCategoryPath(a.category_id);
      const bp = buildCategoryPath(b.category_id);
      if (ap !== bp) return ap.localeCompare(bp);
      return (a.sort_order - b.sort_order) || a.label.localeCompare(b.label);
    })
    .map(i => ({
      ...i,
      categoryPath: buildCategoryPath(i.category_id),
      displayLabel: `${buildCategoryPath(i.category_id)} > ${i.label}`
    }));

  const [itemId, setItemId] = useState(record.item_id || (activeItems[0]?.id ?? ''));
  const [unitPrice, setUnitPrice] = useState(String(record.unit_price ?? 0));
  const [qty, setQty] = useState(record.quantity || 1);
  const [customerName, setCustomerName] = useState(record.customer_name || '');
  const [paymentMethod, setPaymentMethod] = useState(record.payment_method || 'cash');


  // Manual item label (free-typed). If it matches an existing item, we will link on save,
  // but the user is allowed to enter any item text even if it doesn't exist in Manage Items.
  const [itemLabel, setItemLabel] = useState(String(record.item_label || ''));
  const selected = activeItems.find(i => i.id === itemId);
  const safeQty = clamp(Number(qty) || 1, 1, 9999);
  const safePrice = Number(unitPrice) || 0;
  const total = safeQty * safePrice;

  return (
    <div style={styles.modalOverlay} onClick={onCancel}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>Edit Sale Entry</div>
        </div>
        <div style={{ ...styles.modalContent, paddingTop: 10 }}>
          <div style={styles.draftGridRow2}>
            <div style={{ ...styles.modalField, marginBottom: 0 }}>
              <div style={styles.modalLabel}>Customer</div>
              <input
                style={styles.modalInput}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="(optional)"
              />
            </div>
            <div style={{ ...styles.modalField, marginBottom: 0 }}>
              <div style={styles.modalLabel}>Payment</div>
              <div style={styles.radioRow}>
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="paymentMethodEdit"
                    checked={paymentMethod === 'cash'}
                    onChange={() => setPaymentMethod('cash')}
                  />
                  <span style={styles.radioText}>Cash</span>
                </label>
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="paymentMethodEdit"
                    checked={paymentMethod === 'credit'}
                    onChange={() => setPaymentMethod('credit')}
                  />
                  <span style={styles.radioText}>Credit</span>
                </label>
              </div>
            </div>
          </div>

          <div style={styles.modalField}>
            <div style={styles.modalLabel}>Item</div>
            <input
              style={styles.modalInput}
              value={itemLabel}
              onChange={(e) => {
                setItemLabel(e.target.value);
                // If user types an exact known item label/path, we can pre-fill unit price (optional nice-to-have).
                const v = String(e.target.value || '').trim();
                const norm = (x) => String(x || '').trim().toLowerCase();
                const exact = activeItems.find(x => norm(x.label) === norm(v))
                  || activeItems.find(x => norm(x.displayLabel) === norm(v));
                if (exact) {
                  setItemId(exact.id);
                  setUnitPrice(String(exact.unit_price ?? 0));
                } else {
                  // Keep existing itemId if user is just typing a manual label.
                  // (We still allow linking on save if it matches later.)
                }
              }}
              placeholder="Type any item"
            />
          </div>

          <div style={styles.draftGridRow2}>
            <div style={{ ...styles.modalField, marginBottom: 0 }}>
              <div style={styles.modalLabel}>Unit price</div>
              <input
                style={styles.modalInput}
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
            <div style={{ ...styles.modalField, marginBottom: 0 }}>
              <div style={styles.modalLabel}>Qty</div>
              <div style={styles.qtyRowInline}>
                <button style={styles.qtyInlineBtn} onClick={() => setQty(clamp(safeQty - 1, 1, 9999))}>−</button>
                <div style={styles.qtyInlineValue}>{safeQty}</div>
                <button style={styles.qtyInlineBtn} onClick={() => setQty(clamp(safeQty + 1, 1, 9999))}>+</button>
              </div>
            </div>
          </div>

          <div style={styles.draftPreviewLine}>
            {(paymentMethod === 'credit' ? 'CREDIT' : 'CASH')} · {(selected ? selected.label : itemLabel).trim()} × {safeQty} = ${formatMoney(total)}
          </div>
        </div>

        <div style={styles.modalActions}>
          <button style={styles.confirmInlineBtn} onClick={() => onConfirm({ itemId, itemLabel, unitPrice: safePrice, quantity: safeQty, customerName: customerName.trim(), paymentMethod })}>CONFIRM</button>
          <button style={styles.cancelInlineBtn} onClick={onCancel}>CANCEL</button>
          <button style={styles.deleteBtn} onClick={onDelete}>DELETE</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EDIT MODAL COMPONENT
// ============================================================================

function EditModal({ record, items, categories, onSave, onCancel }) {
  const int = (x) => {
    const n = parseInt(x, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const parseLocalTime = (s) => {
    const str = String(s || '').trim();
    const m = str.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!m) return { h12: 12, min: 0, ampm: 'AM' };
    let h = int(m[1]);
    const min = int(m[2]);
    if (m[3]) {
      const ampm = m[3].toUpperCase();
      // Stored already in 12h
      h = (h % 12) === 0 ? 12 : (h % 12);
      return { h12: h, min, ampm };
    }
    // Backward compatibility: stored in 24h HH:MM
    const h24 = h % 24;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { h12, min, ampm };
  };

  const initTime = parseLocalTime(record.sale_time_local);
  const [editHour12, setEditHour12] = useState(initTime.h12);
  const [editMinute, setEditMinute] = useState(initTime.min);
  const [editAmPm, setEditAmPm] = useState(initTime.ampm);
  const [editQuantity, setEditQuantity] = useState(record.quantity);
  const [editItemId, setEditItemId] = useState(record.item_id);
  const [showItemPicker, setShowItemPicker] = useState(false);

  const activeItems = items.filter(i => i.is_active);
  const selectedItem = activeItems.find(i => i.id === editItemId);

  const handleSave = () => {
    if (!selectedItem) return;

    const pad = (n) => String(n).padStart(2, '0');
    const hour24 = editAmPm === 'AM' ? (editHour12 % 12) : (editHour12 % 12) + 12;
    const newSaleTime = `${pad(editHour12)}:${pad(editMinute)} ${editAmPm}`;

    const saleDate = new Date(record.sale_timestamp_local.split(' ')[0]);
    saleDate.setHours(hour24, editMinute, 0, 0);

    // Build category path
    const getCategoryPath = (categoryId) => {
      const path = [];
      let current = categories.find(c => c.id === categoryId);
      while (current) {
        path.unshift(current.label);
        current = categories.find(c => c.id === current.parent_id);
      }
      return path.join(' > ');
    };

    const unitPrice = selectedItem.unit_price || 0;
    const totalPrice = unitPrice * editQuantity;

    const updated = {
      ...record,
      sale_time_local: newSaleTime,
      sale_timestamp_local: `${formatDate(saleDate)} ${newSaleTime}`,
      sale_time_epoch_ms: saleDate.getTime(),
      item_id: selectedItem.id,
      item_label: selectedItem.label,
      category_path: getCategoryPath(selectedItem.category_id),
      unit_price: unitPrice,
      quantity: editQuantity,
      total_price: totalPrice
    };

    onSave(updated);
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        {showItemPicker ? (
          <ItemPicker
            categories={categories}
            items={items}
            onSelect={(item) => {
              setEditItemId(item.id);
              setShowItemPicker(false);
            }}
            onClose={() => setShowItemPicker(false)}
          />
        ) : (
          <>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>Edit Entry</div>
            </div>
            <div style={styles.modalContent}>
              <div style={styles.editSection}>
                <div style={styles.editLabel}>Time</div>
                <div style={styles.timeEditControls}>
                  <div style={styles.timeEditColumn}>
                    <button style={styles.timeEditBtn} onClick={() => setEditHour12((prev) => (prev === 12 ? 1 : prev + 1))}>+</button>
                    <div style={styles.timeEditValue}>{String(editHour12).padStart(2, '0')}</div>
                    <button style={styles.timeEditBtn} onClick={() => setEditHour12((prev) => (prev === 1 ? 12 : prev - 1))}>−</button>
                  </div>
                  <div style={styles.timeEditSep}>:</div>
                  <div style={styles.timeEditColumn}>
                    <button style={styles.timeEditBtn} onClick={() => setEditMinute((editMinute + 1) % 60)}>+</button>
                    <div style={styles.timeEditValue}>{String(editMinute).padStart(2, '0')}</div>
                    <button style={styles.timeEditBtn} onClick={() => setEditMinute((editMinute - 1 + 60) % 60)}>−</button>
                  </div>
                  <div style={{ ...styles.timeEditColumn, minWidth: 70 }}>
                    <button style={styles.timeEditBtn} onClick={() => setEditAmPm((prev) => (prev === 'AM' ? 'PM' : 'AM'))}>+</button>
                    <div style={styles.timeEditValue}>{editAmPm}</div>
                    <button style={styles.timeEditBtn} onClick={() => setEditAmPm((prev) => (prev === 'AM' ? 'PM' : 'AM'))}>−</button>
                  </div>
                </div>
              </div>

              <div style={styles.editSection}>
                <div style={styles.editLabel}>Item</div>
                <div style={styles.editItemDisplay}>
                  {selectedItem ? selectedItem.label : 'None'}
                </div>
                <button style={styles.editChangeBtn} onClick={() => setShowItemPicker(true)}>
                  Change Item
                </button>
              </div>

              <div style={styles.editSection}>
                <div style={styles.editLabel}>Quantity</div>
                <div style={styles.editQuantityControls}>
                  <button 
                    style={styles.editQuantityBtn} 
                    onClick={() => setEditQuantity(Math.max(1, editQuantity - 1))}
                  >
                    −
                  </button>
                  <div style={styles.editQuantityValue}>{editQuantity}</div>
                  <button 
                    style={styles.editQuantityBtn} 
                    onClick={() => setEditQuantity(editQuantity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>

              {selectedItem && (
                <div style={styles.editPreview}>
                  Total: ${formatMoney((selectedItem.unit_price || 0) * editQuantity)}
                </div>
              )}
            </div>
            <div style={styles.modalActions}>
              <button style={styles.modalSaveBtn} onClick={handleSave}>SAVE</button>
              <button style={styles.modalCancelBtn} onClick={onCancel}>CANCEL</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MANAGE ITEMS SCREEN
// ============================================================================


function ManageItemsScreen({ shellStyle, categories, items, onUpdateCategories, onUpdateItems, onBack, onToast }) {
  // Folder/File explorer model:
  // - categories == folders (can nest via parent_id)
  // - items == files (belong to category_id folder; null means root)
  const [breadcrumb, setBreadcrumb] = useState([]); // array of category objects
  const currentFolderId = breadcrumb.length ? breadcrumb[breadcrumb.length - 1].id : null;

  const activeCategories = categories.filter(c => c.is_active);
  const allCategories = categories; // include inactive for validation/moves if needed

  const childrenFolders = activeCategories
    .filter(c => c.parent_id === currentFolderId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label).localeCompare(String(b.label)));

  const folderItems = items
    .filter(i => (i.category_id ?? null) === currentFolderId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label).localeCompare(String(b.label)));

  const getCategoryById = (id) => allCategories.find(c => c.id === id);

  const getCategoryPath = (id) => {
    if (!id) return 'Root';
    const path = [];
    let cur = getCategoryById(id);
    const guard = new Set();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      path.unshift(cur.label);
      cur = getCategoryById(cur.parent_id);
    }
    return path.join(' > ') || 'Root';
  };

  const buildCategoryOptions = ({ excludeId = null, excludeDescendantsOf = null } = {}) => {
    // Returns [{id:null,label:'Root'}, {id:'...',label:'A > B'}] sorted by label
    const isDescendant = (candidateId, ancestorId) => {
      if (!candidateId || !ancestorId) return false;
      let cur = getCategoryById(candidateId);
      const guard = new Set();
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        if (cur.parent_id === ancestorId) return true;
        cur = getCategoryById(cur.parent_id);
      }
      return false;
    };

    const opts = [{ id: null, label: 'Root' }];
    activeCategories.forEach(c => {
      if (excludeId && c.id === excludeId) return;
      if (excludeDescendantsOf && isDescendant(c.id, excludeDescendantsOf)) return;
      opts.push({ id: c.id, label: getCategoryPath(c.id) });
    });
    opts.sort((a, b) => a.label.localeCompare(b.label));
    // keep Root at top
    const root = opts.find(o => o.id === null);
    const rest = opts.filter(o => o.id !== null);
    return [root, ...rest];
  };

  // --------------------------------------------------------------------------
  // Modals
  // --------------------------------------------------------------------------

  const [folderModal, setFolderModal] = useState({
    open: false,
    mode: 'add', // add | edit
    id: null,
    label: '',
    parent_id: null
  });

  const [itemModal, setItemModal] = useState({
    open: false,
    mode: 'add', // add | edit
    id: null,
    label: '',
    unit_price: '0',
    category_id: null,
    is_active: 1
  });

  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: 'Confirm',
    message: 'Are you sure?',
    action: null
  });

  const openConfirm = ({ title, message, action }) => setConfirmModal({ open: true, title, message, action });
  const closeConfirm = () => setConfirmModal({ open: false, title: 'Confirm', message: 'Are you sure?', action: null });

  // --------------------------------------------------------------------------
  // Folder actions
  // --------------------------------------------------------------------------

  const openFolder = (folder) => setBreadcrumb([...breadcrumb, folder]);

  const goToRoot = () => setBreadcrumb([]);

  const goToCrumb = (idx) => setBreadcrumb(breadcrumb.slice(0, idx + 1));

  const handleCreateFolder = () => {
    setFolderModal({
      open: true,
      mode: 'add',
      id: null,
      label: '',
      parent_id: currentFolderId
    });
  };

  const handleEditFolder = (folder) => {
    setFolderModal({
      open: true,
      mode: 'edit',
      id: folder.id,
      label: folder.label || '',
      parent_id: folder.parent_id ?? null
    });
  };

  const saveFolder = () => {
    const label = (folderModal.label || '').trim();
    if (!label) {
      onToast('Folder name required');
      return;
    }

    if (folderModal.mode === 'add') {
      const newFolder = {
        id: `cat_${Date.now()}`,
        label,
        parent_id: folderModal.parent_id ?? null,
        sort_order: categories.length + 1,
        is_active: 1
      };
      onUpdateCategories([...categories, newFolder]);
      onToast('Folder created');
    } else {
      const folderId = folderModal.id;
      const newParent = folderModal.parent_id ?? null;

      // Prevent cycles: parent cannot be itself or any of its descendants
      const isDescendantOf = (candidateParentId, childId) => {
        if (!candidateParentId || !childId) return false;
        let cur = getCategoryById(candidateParentId);
        const guard = new Set();
        while (cur && !guard.has(cur.id)) {
          guard.add(cur.id);
          if (cur.parent_id === childId) return true;
          cur = getCategoryById(cur.parent_id);
        }
        return false;
      };

      if (newParent === folderId) {
        onToast('Folder cannot be its own parent');
        return;
      }
      if (isDescendantOf(newParent, folderId)) {
        onToast('Cannot move folder into its own subfolder');
        return;
      }

      onUpdateCategories(categories.map(c => (
        c.id === folderId ? { ...c, label, parent_id: newParent } : c
      )));
      onToast('Folder updated');
    }

    setFolderModal({ open: false, mode: 'add', id: null, label: '', parent_id: null });
  };

  const handleDeleteFolder = (folder) => {
    openConfirm({
      title: 'Delete folder?',
      message: 'Folder must be empty (no subfolders and no items) to delete.',
      action: () => {
        const hasSubfolders = categories.some(c => (c.parent_id ?? null) === folder.id);
        const hasItems = items.some(i => (i.category_id ?? null) === folder.id);
        if (hasSubfolders || hasItems) {
          onToast('Folder not empty');
          closeConfirm();
          return;
        }
        onUpdateCategories(categories.filter(c => c.id !== folder.id));
        // if user is inside this folder, go up
        if (currentFolderId === folder.id) {
          setBreadcrumb(breadcrumb.slice(0, -1));
        }
        onToast('Folder deleted');
        closeConfirm();
      }
    });
  };

  // --------------------------------------------------------------------------
  // Item actions
  // --------------------------------------------------------------------------

  const handleCreateItem = () => {
    setItemModal({
      open: true,
      mode: 'add',
      id: null,
      label: '',
      unit_price: '0',
      category_id: currentFolderId, // allow root items
      is_active: 1
    });
  };

  const handleEditItem = (it) => {
    setItemModal({
      open: true,
      mode: 'edit',
      id: it.id,
      label: it.label || '',
      unit_price: String(it.unit_price ?? '0'),
      category_id: it.category_id ?? null,
      is_active: it.is_active ?? 1
    });
  };

  const saveItem = () => {
    const label = (itemModal.label || '').trim();
    if (!label) {
      onToast('Item name required');
      return;
    }
    const unitPrice = parseNumber(itemModal.unit_price, 0);
    const folderId = itemModal.category_id ?? null;

    if (itemModal.mode === 'add') {
      const newItem = {
        id: `item_${Date.now()}`,
        label,
        unit_price: unitPrice,
        category_id: folderId,
        sort_order: items.length + 1,
        is_active: 1
      };
      onUpdateItems([...items, newItem]);
      onToast('Item created');
    } else {
      onUpdateItems(items.map(i => (
        i.id === itemModal.id
          ? { ...i, label, unit_price: unitPrice, category_id: folderId }
          : i
      )));
      onToast('Item updated');
    }

    setItemModal({ open: false, mode: 'add', id: null, label: '', unit_price: '0', category_id: null, is_active: 1 });
  };

  const toggleItemActive = (it) => {
    const next = it.is_active ? 0 : 1;
    onUpdateItems(items.map(x => (x.id === it.id ? { ...x, is_active: next } : x)));
    onToast(next ? 'Item activated' : 'Item deactivated');
  };

  const deleteItem = (it) => {
    openConfirm({
      title: 'Delete item?',
      message: 'This permanently removes the item from the menu. Existing sales records will remain unchanged.',
      action: () => {
        onUpdateItems(items.filter(x => x.id !== it.id));
        onToast('Item deleted');
        closeConfirm();
      }
    });
  };



  // --------------------------------------------------------------------------
  // Reordering (within current folder)
  // --------------------------------------------------------------------------

  const sortByOrderThenLabel = (a, b) => {
    const ao = (a.sort_order ?? 0);
    const bo = (b.sort_order ?? 0);
    if (ao != bo) return ao - bo;
    return String(a.label ?? '').localeCompare(String(b.label ?? ''));
  };

  const moveFolderInCurrent = (folderId, direction) => {
    // direction: -1 (up), +1 (down)
    const siblings = activeCategories
      .filter(c => (c.parent_id ?? null) === currentFolderId)
      .slice()
      .sort(sortByOrderThenLabel);

    const idx = siblings.findIndex(x => x.id === folderId);
    const j = idx + direction;
    if (idx < 0 || j < 0 || j >= siblings.length) return;

    const swapped = siblings.slice();
    [swapped[idx], swapped[j]] = [swapped[j], swapped[idx]];

    const orderMap = { }
    for (let k = 0; k < swapped.length; k++) {
      orderMap[swapped[k].id] = k + 1;
    }

    onUpdateCategories(categories.map(c => {
      if ((c.parent_id ?? null) === currentFolderId && c.is_active && orderMap[c.id] != null) {
        return { ...c, sort_order: orderMap[c.id] };
      }
      return c;
    }));
  };

  const moveItemInCurrent = (itemId, direction) => {
    // direction: -1 (up), +1 (down)
    const siblings = items
      .filter(i => (i.category_id ?? null) === currentFolderId)
      .slice()
      .sort(sortByOrderThenLabel);

    const idx = siblings.findIndex(x => x.id === itemId);
    const j = idx + direction;
    if (idx < 0 || j < 0 || j >= siblings.length) return;

    const swapped = siblings.slice();
    [swapped[idx], swapped[j]] = [swapped[j], swapped[idx]];

    const orderMap = { }
    for (let k = 0; k < swapped.length; k++) {
      orderMap[swapped[k].id] = k + 1;
    }

    onUpdateItems(items.map(i => {
      if ((i.category_id ?? null) === currentFolderId && orderMap[i.id] != null) {
        return { ...i, sort_order: orderMap[i.id] };
      }
      return i;
    }));
  };
  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const folderParentOptions = buildCategoryOptions({
    excludeId: folderModal.mode === 'edit' ? folderModal.id : null,
    excludeDescendantsOf: folderModal.mode === 'edit' ? folderModal.id : null
  });

  const itemFolderOptions = buildCategoryOptions();

  return (
    <div style={shellStyle}>
      <div style={styles.header}>
        <button style={styles.headerBtn} onClick={onBack}>BACK</button>
        <div style={styles.headerTitle}>Manage Items</div>
        <div style={{ width: 64 }} />
      </div>

      <div style={styles.manageTopBar}>
        <button style={styles.managePrimaryBtn} onClick={handleCreateItem}>Create Item</button>
        <button style={styles.manageSecondaryBtn} onClick={handleCreateFolder}>Create Folder</button>
      </div>

      <div style={styles.breadcrumbBar}>
        <button style={styles.breadcrumbBtn} onClick={goToRoot}>Root</button>
        {breadcrumb.map((c, idx) => (
          <React.Fragment key={c.id}>
            <div style={styles.breadcrumbSep}>›</div>
            <button style={styles.breadcrumbBtn} onClick={() => goToCrumb(idx)}>{c.label}</button>
          </React.Fragment>
        ))}
      </div>

      <div style={styles.manageList}>
        {childrenFolders.length === 0 && folderItems.length === 0 ? (
          <div style={styles.manageEmpty}>Empty</div>
        ) : (
          <>
            {childrenFolders.map(folder => (
              <div key={folder.id} style={styles.manageRow}>
                <button style={styles.manageRowMain} onClick={() => openFolder(folder)}>
                  <div style={styles.manageRowTitle}>📁 {folder.label}</div>
                  <div style={styles.manageRowSub}>{getCategoryPath(folder.id)}</div>
                </button>
                <div style={styles.manageRowActions}>
                  <div style={styles.manageReorderRow}>
                    <button
                      style={{ ...styles.manageReorderBtn, ...(childrenFolders.findIndex(f => f.id === folder.id) === 0 ? styles.manageReorderBtnDisabled : {}) }}
                      disabled={childrenFolders.findIndex(f => f.id === folder.id) === 0}
                      onClick={() => moveFolderInCurrent(folder.id, -1)}
                      title="Move up"
                    >↑</button>
                    <button
                      style={{ ...styles.manageReorderBtn, ...(childrenFolders.findIndex(f => f.id === folder.id) === childrenFolders.length - 1 ? styles.manageReorderBtnDisabled : {}) }}
                      disabled={childrenFolders.findIndex(f => f.id === folder.id) === childrenFolders.length - 1}
                      onClick={() => moveFolderInCurrent(folder.id, 1)}
                      title="Move down"
                    >↓</button>
                  </div>
                  <button style={styles.manageSmallBtn} onClick={() => handleEditFolder(folder)}>Edit</button>
                  <button style={styles.manageSmallBtnDanger} onClick={() => handleDeleteFolder(folder)}>Delete</button>
                </div>
              </div>
            ))}

            {folderItems.map(it => (
              <div key={it.id} style={styles.manageRow}>
                <div style={styles.manageRowMainStatic}>
                  <div style={styles.manageRowTitle}>
                    📄 {it.label} {!it.is_active ? <span style={styles.inactiveTag}>INACTIVE</span> : null}
                  </div>
                  <div style={styles.manageRowSub}>
                    ${formatMoney(it.unit_price || 0)} · {getCategoryPath(it.category_id ?? null)}
                  </div>
                </div>
                <div style={styles.manageRowActions}>
                  <div style={styles.manageReorderRow}>
                    <button
                      style={{ ...styles.manageReorderBtn, ...(folderItems.findIndex(x => x.id === it.id) === 0 ? styles.manageReorderBtnDisabled : {}) }}
                      disabled={folderItems.findIndex(x => x.id === it.id) === 0}
                      onClick={() => moveItemInCurrent(it.id, -1)}
                      title="Move up"
                    >↑</button>
                    <button
                      style={{ ...styles.manageReorderBtn, ...(folderItems.findIndex(x => x.id === it.id) === folderItems.length - 1 ? styles.manageReorderBtnDisabled : {}) }}
                      disabled={folderItems.findIndex(x => x.id === it.id) === folderItems.length - 1}
                      onClick={() => moveItemInCurrent(it.id, 1)}
                      title="Move down"
                    >↓</button>
                  </div>
                  <button style={styles.manageSmallBtn} onClick={() => handleEditItem(it)}>Edit</button>
                  <button style={styles.manageSmallBtn} onClick={() => toggleItemActive(it)}>{it.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button style={styles.manageSmallBtnDanger} onClick={() => deleteItem(it)}>Delete</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Folder modal */}
      {folderModal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>{folderModal.mode === 'add' ? 'Create Folder' : 'Edit Folder'}</div>
            </div>
            <div style={styles.modalContent}>
              <div style={styles.modalField}>
                <div style={styles.modalLabel}>Folder name</div>
                <input
                  style={styles.modalInput}
                  value={folderModal.label}
                  onChange={(e) => setFolderModal({ ...folderModal, label: e.target.value })}
                  placeholder="e.g., Kava"
                />
              </div>
              <div style={styles.modalField}>
                <div style={styles.modalLabel}>Parent folder</div>
                <select
                  style={styles.modalSelect}
                  value={folderModal.parent_id ?? ''}
                  onChange={(e) => setFolderModal({ ...folderModal, parent_id: e.target.value ? e.target.value : null })}
                >
                  {folderParentOptions.map(opt => (
                    <option key={String(opt.id)} value={opt.id ?? ''}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={styles.modalActions}>
              <button style={styles.modalBtnPrimary} onClick={saveFolder}>SAVE</button>
              <button style={styles.modalBtn} onClick={() => setFolderModal({ open: false, mode: 'add', id: null, label: '', parent_id: null })}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Item modal */}
      {itemModal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>{itemModal.mode === 'add' ? 'Create Item' : 'Edit Item'}</div>
            </div>
            <div style={styles.modalContent}>
              <div style={styles.modalField}>
                <div style={styles.modalLabel}>Item name</div>
                <input
                  style={styles.modalInput}
                  value={itemModal.label}
                  onChange={(e) => setItemModal({ ...itemModal, label: e.target.value })}
                  placeholder="e.g., Kava Light"
                />
              </div>
              <div style={styles.modalField}>
                <div style={styles.modalLabel}>Unit price</div>
                <input
                  style={styles.modalInput}
                  inputMode="decimal"
                  value={itemModal.unit_price}
                  onChange={(e) => setItemModal({ ...itemModal, unit_price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div style={styles.modalField}>
                <div style={styles.modalLabel}>Folder</div>
                <select
                  style={styles.modalSelect}
                  value={itemModal.category_id ?? ''}
                  onChange={(e) => setItemModal({ ...itemModal, category_id: e.target.value ? e.target.value : null })}
                >
                  {itemFolderOptions.map(opt => (
                    <option key={String(opt.id)} value={opt.id ?? ''}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={styles.modalActions}>
              <button style={styles.modalBtnPrimary} onClick={saveItem}>SAVE</button>
              <button style={styles.modalBtn} onClick={() => setItemModal({ open: false, mode: 'add', id: null, label: '', unit_price: '0', category_id: null, is_active: 1 })}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>{confirmModal.title}</div>
            </div>
            <div style={styles.modalContent}>
              <div style={styles.modalBodyText}>{confirmModal.message}</div>
            </div>
            <div style={styles.modalActions}>
              <button style={styles.modalBtn} onClick={closeConfirm}>CANCEL</button>
              <button style={{ ...styles.modalBtnPrimary, ...styles.modalBtnDanger }} onClick={() => confirmModal.action && confirmModal.action()}>YES</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================================
// STYLES (TIGHTER LAYOUT)
// ============================================================================

// ============================================================================
// SETTINGS SCREEN (opening/closing hours for business-day grouping)
// ============================================================================

function SettingsScreen({ shellStyle, settings, onUpdate, onBack }) {
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const minToParts = (minutes) => {
    const m = clamp(Number(minutes) || 0, 0, 23 * 60 + 59);
    const h24 = Math.floor(m / 60);
    const mm = m % 60;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { h12, mm, ampm };
  };

  const partsToMin = ({ h12, mm, ampm }) => {
    const hour12 = clamp(Number(h12) || 12, 1, 12);
    const minute = clamp(Number(mm) || 0, 0, 59);
    const h24 = (ampm === 'PM' ? (hour12 % 12) + 12 : (hour12 % 12));
    return h24 * 60 + minute;
  };

  const [openParts, setOpenParts] = useState(() => minToParts(settings.opening_min));
  const [closeParts, setCloseParts] = useState(() => minToParts(settings.closing_min));

  useEffect(() => {
    setOpenParts(minToParts(settings.opening_min));
    setCloseParts(minToParts(settings.closing_min));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.opening_min, settings.closing_min]);

  const save = (nextOpenParts, nextCloseParts) => {
    const opening_min = partsToMin(nextOpenParts);
    const closing_min = partsToMin(nextCloseParts);
    onUpdate({ ...settings, opening_min, closing_min });
  };

  const adjust = (which, field, delta) => {
    if (which === 'open') {
      const next = { ...openParts };
      if (field === 'hour') {
        let h = next.h12 + delta;
        while (h < 1) h += 12;
        while (h > 12) h -= 12;
        next.h12 = h;
      } else if (field === 'minute') {
        next.mm = (next.mm + delta + 60) % 60;
      } else if (field === 'ampm') {
        next.ampm = next.ampm === 'AM' ? 'PM' : 'AM';
      }
      setOpenParts(next);
      save(next, closeParts);
    } else {
      const next = { ...closeParts };
      if (field === 'hour') {
        let h = next.h12 + delta;
        while (h < 1) h += 12;
        while (h > 12) h -= 12;
        next.h12 = h;
      } else if (field === 'minute') {
        next.mm = (next.mm + delta + 60) % 60;
      } else if (field === 'ampm') {
        next.ampm = next.ampm === 'AM' ? 'PM' : 'AM';
      }
      setCloseParts(next);
      save(openParts, next);
    }
  };

  const pad = (n) => String(n).padStart(2, '0');
  const openStr = `${pad(openParts.h12)}:${pad(openParts.mm)} ${openParts.ampm}`;
  const closeStr = `${pad(closeParts.h12)}:${pad(closeParts.mm)} ${closeParts.ampm}`;
  const spansMidnight = (settings.closing_min ?? (23 * 60 + 59)) < (settings.opening_min ?? 0);

  const resetDefaults = () => {
    onUpdate({ ...settings, opening_min: 0, closing_min: 23 * 60 + 59 });
  };

  const TimeStrip = ({ title, parts, which }) => (
    <div style={styles.settingsStrip}>
      <div style={styles.settingsStripTitle}>{title}</div>
      <div style={styles.timeControlsTight}>
        <div style={styles.timeColumnTight}>
          <button style={styles.timeBtnTight} onClick={() => adjust(which, 'hour', 1)}>+</button>
          <div style={styles.timeMidBox}><div style={styles.timeMidValue}>{pad(parts.h12)}</div></div>
          <button style={styles.timeBtnTight} onClick={() => adjust(which, 'hour', -1)}>−</button>
        </div>
        <div style={styles.timeColumnTight}>
          <button style={styles.timeBtnTight} onClick={() => adjust(which, 'minute', 1)}>+</button>
          <div style={styles.timeMidBox}><div style={styles.timeMidValue}>{pad(parts.mm)}</div></div>
          <button style={styles.timeBtnTight} onClick={() => adjust(which, 'minute', -1)}>−</button>
        </div>
        <div style={styles.timeColumnTight}>
          <button style={styles.timeBtnTight} onClick={() => adjust(which, 'ampm', 1)}>+</button>
          <div style={styles.timeMidBox}><div style={styles.timeMidValue}>{parts.ampm}</div></div>
          <button style={styles.timeBtnTight} onClick={() => adjust(which, 'ampm', -1)}>−</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={shellStyle}>
      <div style={styles.header}>
        <button style={styles.headerBtn} onClick={onBack}>BACK</button>
        <div style={styles.headerTitle}>Settings</div>
        <div style={{ width: 64 }} />
      </div>

      <div style={styles.settingsContent}>
        <div style={styles.settingsHint}>
          Daily sales group by your <b>opening day</b>. Example: Open 4:00 PM, Close 2:00 AM → sales between 4:00 PM (day X) and 2:00 AM (day X+1) appear under day X.
        </div>

        <TimeStrip title="Opening time" parts={openParts} which="open" />
        <TimeStrip title="Closing time" parts={closeParts} which="close" />

        <div style={styles.settingsSummary}>
          Current: <b>{openStr}</b> → <b>{closeStr}</b>{spansMidnight ? ' (spans midnight)' : ''}
        </div>

        <button style={styles.manageSecondaryBtn} onClick={resetDefaults}>Reset to defaults</button>
      </div>
    </div>
  );
}

const styles = {
  // ---------------------------------------------------------------------------
  // LAYOUT TOKENS
  // ---------------------------------------------------------------------------
  container: {
    // Mobile-first app shell
    minHeight: '100svh',
    width: '100%',
    maxWidth: '520px',
    margin: '0 auto',
    backgroundColor: '#f6f7f9',
    color: '#0f172a',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    padding: '12px',
    paddingTop: 'max(12px, env(safe-area-inset-top))',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    gap: '12px',
    overflowX: 'hidden',
  },

  containerWide: {
    // Desktop: just a little breathing room
    maxWidth: '720px',
    padding: '14px',
    borderRadius: '14px',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f6f7f9',
  },

  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '10px',
    borderRadius: '12px',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 0 rgba(15, 23, 42, 0.08)',
  },

  headerTitle: {
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '0.2px',
    color: '#0f172a',
    textAlign: 'center',
    flex: 1,
    minWidth: 0,
  },

  headerBtn: {
    height: '40px',
    padding: '0 12px',
    borderRadius: '10px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 700,
    fontSize: '12px',
    letterSpacing: '0.6px',
    cursor: 'pointer',
    flexShrink: 0,
  },

  // ---------------------------------------------------------------------------
  // COMMON SURFACES / TEXT
  // ---------------------------------------------------------------------------
  sectionTight: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '12px',
    boxShadow: '0 1px 0 rgba(15, 23, 42, 0.06)',
  },

  toast: {
    position: 'fixed',
    left: '50%',
    bottom: '18px',
    transform: 'translateX(-50%)',
    zIndex: 60,
    backgroundColor: '#111827',
    color: '#ffffff',
    padding: '10px 12px',
    borderRadius: '999px',
    fontSize: '13px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    maxWidth: 'min(520px, calc(100vw - 24px))',
    textAlign: 'center',
  },

  emptyState: {
    padding: '18px 12px',
    textAlign: 'center',
    color: '#475569',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px dashed rgba(15, 23, 42, 0.16)',
  },

  dangerBtn: {
    borderColor: 'rgba(185, 28, 28, 0.35)',
    color: '#b91c1c',
    backgroundColor: '#fff5f5',
  },

  // ---------------------------------------------------------------------------
  // MENU
  // ---------------------------------------------------------------------------
  menuContent: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '10px',
  },

  menuItem: {
    width: '100%',
    height: '48px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 800,
    letterSpacing: '0.4px',
    cursor: 'pointer',
  },

  // ---------------------------------------------------------------------------
  // ENTRY SCREEN
  // ---------------------------------------------------------------------------
  entryContentTight: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: 1,
    minHeight: 0,
  },

  sectionDate: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '10px',
    boxShadow: '0 1px 0 rgba(15, 23, 42, 0.06)',
  },

  dateBtn: {
    width: '44px',
    height: '40px',
    borderRadius: '10px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: '18px',
    fontWeight: 900,
    cursor: 'pointer',
  },

  dateValue: {
    fontWeight: 800,
    color: '#0f172a',
    fontSize: '14px',
    textAlign: 'center',
    flex: 1,
    minWidth: 0,
    lineHeight: 1.2,
  },

  timeSectionCompact: {
    padding: '12px',
  },

  timeControlsTight: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '10px',
    alignItems: 'stretch',
  },

  timeColumnTight: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'stretch',
  },

  timeBtnTight: {
    height: '40px',
    borderRadius: '10px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 900,
    fontSize: '16px',
    cursor: 'pointer',
  },

  timeMidBox: {
    height: '44px',
    borderRadius: '10px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  timeMidValue: {
    fontSize: '16px',
    fontWeight: 900,
    letterSpacing: '0.6px',
    color: '#0f172a',
  },

  itemSectionGrow: {
    flex: 1,
    minHeight: 0,
  },

  itemAreaTight: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },

  itemBigBtn: {
    width: '100%',
    height: '64px',
    borderRadius: '14px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 900,
    fontSize: '14px',
    letterSpacing: '0.4px',
    cursor: 'pointer',
  },

  itemSelectedCard: {
    borderRadius: '14px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },

  itemTitle2: {
    fontSize: '16px',
    fontWeight: 900,
    color: '#0f172a',
  },

  itemMeta2: {
    fontSize: '12px',
    color: '#475569',
    lineHeight: 1.2,
  },

  qtyInlineDisplay: {
    fontSize: '12px',
    color: '#0f172a',
    fontWeight: 800,
  },

  itemActionsRow2: {
    display: 'grid',
    gridTemplateColumns: '48px 1fr 1fr 48px',
    gap: '8px',
    alignItems: 'center',
  },

  qtyInlineBtn: {
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 900,
    fontSize: '18px',
    cursor: 'pointer',
  },

  confirmInlineBtn: {
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontWeight: 900,
    fontSize: '12px',
    letterSpacing: '0.8px',
    cursor: 'pointer',
  },

  cancelInlineBtn: {
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 900,
    fontSize: '12px',
    letterSpacing: '0.8px',
    cursor: 'pointer',
  },

  previewTight: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    color: '#0f172a',
    fontSize: '13px',
    lineHeight: 1.25,
    wordBreak: 'break-word',
  },

  previewClickable: {
    cursor: 'pointer',
  },

  // ---------------------------------------------------------------------------
  // TABLE SCREEN
  // ---------------------------------------------------------------------------
  tableContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flex: 1,
    minHeight: 0,
  },

  summary: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '10px 12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    fontWeight: 800,
    color: '#0f172a',
    fontSize: '13px',
  },

  recordList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flex: 1,
    minHeight: 0,
  },

  recordRow: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },

  voidRow: {
    opacity: 0.65,
  },

  recordMain: {
    display: 'grid',
    gridTemplateColumns: '72px 1fr',
    gap: '10px',
    alignItems: 'start',
  },

  recordTime: {
    fontWeight: 900,
    color: '#0f172a',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },

  recordItem: {
    fontWeight: 900,
    color: '#0f172a',
    fontSize: '14px',
    lineHeight: 1.2,
    wordBreak: 'break-word',
  },

  recordPrice: {
    gridColumn: '1 / -1',
    color: '#334155',
    fontSize: '13px',
    fontWeight: 700,
  },

  voidBadge: {
    marginLeft: '8px',
    fontSize: '11px',
    fontWeight: 900,
    color: '#b91c1c',
    border: '1px solid rgba(185, 28, 28, 0.35)',
    backgroundColor: '#fff5f5',
    borderRadius: '999px',
    padding: '2px 8px',
    verticalAlign: 'middle',
  },

  recordActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },

  actionBtn: {
    height: '42px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 900,
    cursor: 'pointer',
  },

  voidBtn: {
    borderColor: 'rgba(185, 28, 28, 0.35)',
    backgroundColor: '#fff5f5',
    color: '#b91c1c',
  },

  // ---------------------------------------------------------------------------
  // SALES SCREEN (LEDGER)
  // ---------------------------------------------------------------------------
  salesContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flex: 1,
    minHeight: 0,
  },

  salesFilters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '10px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
  },

  salesFilterLabel: {
    fontSize: '12px',
    fontWeight: 900,
    color: '#334155',
    marginRight: '4px',
  },

  smallPill: {
    height: '34px',
    padding: '0 12px',
    borderRadius: '999px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 800,
    fontSize: '12px',
    cursor: 'pointer',
  },

  smallPillActive: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
  },

  salesTableWrap: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    flex: 1,
  },

  salesHeaderRow: {
    display: 'grid',
    gridTemplateColumns: '88px 1fr 60px 86px 96px',
    gap: '0',
    padding: '10px 10px',
    borderBottom: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    fontWeight: 900,
    fontSize: '12px',
    color: '#334155',
  },

  salesHeaderCellTime: {
    textAlign: 'left',
    backgroundColor: 'transparent',
    border: 'none',
    padding: 0,
    font: 'inherit',
    fontWeight: 900,
    color: '#334155',
    cursor: 'pointer',
  },

  salesHeaderCell: {
    textAlign: 'left',
  },

  salesHeaderCellRight: {
    textAlign: 'right',
  },

  salesRow: {
    display: 'grid',
    gridTemplateColumns: '88px 1fr 60px 86px 96px',
    padding: '10px 10px',
    borderBottom: '1px solid rgba(15, 23, 42, 0.06)',
    alignItems: 'center',
    cursor: 'pointer',
  },

  creditRow: {
    backgroundColor: '#fffaf0',
  },

  salesCellTime: {
    fontWeight: 900,
    color: '#0f172a',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },

  salesCellItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },

  salesItemLabel: {
    fontWeight: 800,
    color: '#0f172a',
    fontSize: '13px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  salesCreditTag: {
    fontSize: '10px',
    fontWeight: 900,
    padding: '2px 8px',
    borderRadius: '999px',
    border: '1px solid rgba(234, 88, 12, 0.35)',
    backgroundColor: '#fff7ed',
    color: '#9a3412',
    flexShrink: 0,
  },

  salesCellRight: {
    textAlign: 'right',
    fontWeight: 800,
    color: '#0f172a',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },

  salesFooter: {
    padding: '10px 12px',
    borderTop: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#ffffff',
  },

  salesFooterText: {
    fontSize: '12px',
    fontWeight: 800,
    color: '#334155',
    textAlign: 'center',
  },

  // ---------------------------------------------------------------------------
  // PICKER + MODALS (robust on any screen size)
  // ---------------------------------------------------------------------------
  pickerOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflowY: 'auto',
  },

  pickerContainer: {
    width: 'min(560px, 100%)',
    maxHeight: 'min(90svh, 760px)',
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  pickerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '10px',
    borderBottom: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f8fafc',
  },

  pickerBackBtn: {
    height: '40px',
    padding: '0 12px',
    borderRadius: '10px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    fontWeight: 900,
    cursor: 'pointer',
  },

  pickerTitle: {
    fontWeight: 900,
    color: '#0f172a',
    fontSize: '14px',
    flex: 1,
    textAlign: 'center',
    minWidth: 0,
  },

  pickerContent: {
    padding: '10px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },

  pickerCategoryBtn: {
    height: '46px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 900,
    cursor: 'pointer',
    textAlign: 'left',
    padding: '0 12px',
  },

  pickerItemBtn: {
    height: '46px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 800,
    cursor: 'pointer',
    textAlign: 'left',
    padding: '0 12px',
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 55,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflowY: 'auto',
  },

  modalCard: {
    width: 'min(560px, 100%)',
    maxHeight: 'min(90svh, 760px)',
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  modalContainer: {
    // Back-compat for older modal component
    width: 'min(560px, 100%)',
    maxHeight: 'min(90svh, 760px)',
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  modalHeader: {
    padding: '12px 12px 10px',
    borderBottom: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f8fafc',
  },

  modalTitle: {
    fontWeight: 900,
    fontSize: '14px',
    color: '#0f172a',
  },

  modalContent: {
    padding: '12px',
    overflowY: 'auto',
  },

  modalField: {
    marginBottom: '10px',
  },

  modalLabel: {
    fontSize: '12px',
    fontWeight: 900,
    color: '#334155',
    marginBottom: '6px',
  },

  modalInput: {
    width: '100%',
    height: '42px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    padding: '0 12px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },

  modalActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    padding: '12px',
    borderTop: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#ffffff',
  },

  deleteBtn: {
    gridColumn: '1 / -1',
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(185, 28, 28, 0.35)',
    backgroundColor: '#fff5f5',
    color: '#b91c1c',
    fontWeight: 900,
    cursor: 'pointer',
  },

  modalSaveBtn: {
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontWeight: 900,
    cursor: 'pointer',
  },

  modalCancelBtn: {
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 900,
    cursor: 'pointer',
  },

  // ---------------------------------------------------------------------------
  // Small form helpers used inside modals
  // ---------------------------------------------------------------------------
  draftGridRow2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    alignItems: 'start',
    marginBottom: '10px',
  },

  radioRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    height: '42px',
    padding: '0 10px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box',
  },

  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: 800,
    color: '#0f172a',
    fontSize: '13px',
  },

  radioText: {
    fontWeight: 800,
  },

  qtyRowInline: {
    display: 'grid',
    gridTemplateColumns: '48px 1fr 48px',
    gap: '8px',
    alignItems: 'center',
    height: '42px',
  },

  qtyInlineValue: {
    height: '42px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    color: '#0f172a',
  },

  draftPreviewLine: {
    marginTop: '6px',
    padding: '10px 12px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f8fafc',
    fontWeight: 900,
    color: '#0f172a',
    fontSize: '13px',
    wordBreak: 'break-word',
  },

  // ---------------------------------------------------------------------------
  // Back-compat keys for the older EditModal (time edit)
  // ---------------------------------------------------------------------------
  editSection: {
    marginBottom: '12px',
  },
  editLabel: {
    fontSize: '12px',
    fontWeight: 900,
    color: '#334155',
    marginBottom: '8px',
  },
  timeEditControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  timeEditColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '6px',
  },
  timeEditBtn: {
    width: '56px',
    height: '40px',
    borderRadius: '10px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    fontWeight: 900,
    cursor: 'pointer',
  },
  timeEditValue: {
    width: '56px',
    height: '40px',
    borderRadius: '10px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    color: '#0f172a',
  },
  timeEditSep: {
    fontWeight: 900,
    color: '#334155',
    marginTop: '18px',
  },
  editItemDisplay: {
    padding: '10px 12px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f8fafc',
    fontWeight: 900,
    color: '#0f172a',
    marginBottom: '10px',
  },
  editChangeBtn: {
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    fontWeight: 900,
    cursor: 'pointer',
  },
  editQuantityControls: {
    display: 'grid',
    gridTemplateColumns: '56px 1fr 56px',
    gap: '10px',
    alignItems: 'center',
  },
  editQuantityBtn: {
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    fontWeight: 900,
    fontSize: '18px',
    cursor: 'pointer',
  },
  editQuantityValue: {
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    color: '#0f172a',
  },
  editPreview: {
    marginTop: '10px',
    padding: '10px 12px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: '#f8fafc',
    fontWeight: 900,
    color: '#0f172a',
    textAlign: 'center',
  },

  // ---------------------------------------------------------------------------
  // SETTINGS / MANAGE ITEMS (simple list layout)
  // ---------------------------------------------------------------------------
  settingsContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: 1,
    minHeight: 0,
  },
  settingsStrip: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    padding: '12px',
  },
  settingsHint: {
    color: '#475569',
    fontSize: '12px',
    lineHeight: 1.3,
  },

  manageTopBar: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  managePrimaryBtn: {
    height: '44px',
    padding: '0 12px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontWeight: 900,
    cursor: 'pointer',
  },
  manageSecondaryBtn: {
    height: '44px',
    padding: '0 12px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 900,
    cursor: 'pointer',
  },
  manageList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flex: 1,
    minHeight: 0,
  },
  manageRow: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  manageRowMain: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  manageRowMainStatic: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    justifyContent: 'space-between',
  },
  manageRowTitle: {
    fontWeight: 900,
    color: '#0f172a',
    fontSize: '14px',
    minWidth: 0,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  manageRowSub: {
    color: '#475569',
    fontSize: '12px',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  manageRowActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  manageSmallBtn: {
    height: '36px',
    padding: '0 10px',
    borderRadius: '10px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 900,
    cursor: 'pointer',
  },
  manageSmallBtnDanger: {
    borderColor: 'rgba(185, 28, 28, 0.35)',
    backgroundColor: '#fff5f5',
    color: '#b91c1c',
  },
  manageReorderRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  manageReorderBtn: {
    height: '36px',
    width: '40px',
    borderRadius: '10px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    fontWeight: 900,
    cursor: 'pointer',
  },
  manageReorderBtnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  manageEmpty: {
    padding: '18px 12px',
    textAlign: 'center',
    color: '#475569',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px dashed rgba(15, 23, 42, 0.16)',
  },

  // ---------------------------------------------------------------------------
  // Breadcrumb
  // ---------------------------------------------------------------------------
  breadcrumbBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
    padding: '8px 10px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.10)',
  },
  breadcrumbBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    color: '#0f172a',
    fontWeight: 900,
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '8px',
  },
  breadcrumbSep: {
    color: '#94a3b8',
    fontWeight: 900,
  },

  // ---------------------------------------------------------------------------
  // Generic confirm modal (Manage items uses these)
  // ---------------------------------------------------------------------------
  modalBodyText: {
    color: '#334155',
    lineHeight: 1.3,
    fontSize: '13px',
  },
  modalBtn: {
    height: '44px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: 900,
    cursor: 'pointer',
  },
  modalBtnPrimary: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
  },
  modalBtnDanger: {
    borderColor: 'rgba(185, 28, 28, 0.35)',
    backgroundColor: '#fff5f5',
    color: '#b91c1c',
  },
  inactiveTag: {
    fontSize: '10px',
    fontWeight: 900,
    padding: '2px 8px',
    borderRadius: '999px',
    border: '1px solid rgba(100, 116, 139, 0.35)',
    backgroundColor: '#f1f5f9',
    color: '#475569',
  },

  modalSelect: {
    width: '100%',
    height: '42px',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    padding: '0 10px',
    fontSize: '14px',
    backgroundColor: '#ffffff',
    outline: 'none',
    boxSizing: 'border-box',
  },

  settingsStripTitle: {
    fontSize: '13px',
    fontWeight: 900,
    color: '#0f172a',
    marginBottom: '6px',
  },

  settingsSummary: {
    fontSize: '12px',
    color: '#334155',
    fontWeight: 800,
    marginTop: '6px',
  },
};
