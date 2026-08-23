// Single source of truth for how the insurer's premium/quote fields behave,
// driven by the product's admin settings. Every downstream view — the insurer
// form, the submitted receipt, the on-screen comparison, the customer compare
// email, and the PDF & Excel exports — uses these helpers so the whole flow
// stays consistent: a field hidden in the admin panel disappears everywhere, a
// custom field shows everywhere, and when "Total Premium" is turned off it is
// shown nowhere.

// Standard premium field turned off for this product in the admin panel.
export const isInsurerFieldHidden = (product, key) =>
  (product?.hiddenInsurerFields || []).includes(key);

// Custom premium/quote fields the admin added to this product's insurer form.
export const customInsurerRows = (product) =>
  (product?.customInsurerFields || []).map((cf) => ({
    key: cf.key,
    label: cf.label,
    type: cf.type || 'currency',
  }));

// Value an insurer entered for a custom field on their response.
export const responseCustomValue = (response, key) => {
  const cf = (response?.custom_fields || []).find((c) => c.key === key);
  return cf ? cf.value : '';
};

// Whether the Total Premium should appear at all for this product.
export const showInsurerTotal = (product) => !product?.hideInsurerTotal;

// Format a custom field's value for display ('—' when empty).
export const formatCustomValue = (value, type) => {
  if (value === '' || value === null || value === undefined) return '—';
  return type === 'text' ? String(value) : Number(value).toLocaleString();
};
