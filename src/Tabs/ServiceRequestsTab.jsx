import React, { useState, useMemo, useEffect, useRef } from "react";
import "../global.css";
import CustomDropdown from "../components/CustomDropdown.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { jsPDF } from "jspdf";
import { doc, updateDoc, deleteDoc, runTransaction, addDoc, collection, arrayUnion } from "firebase/firestore";
import { db, invoicesCollection } from "../firebase.js";

// Tier limits configuration
const TIER_LIMITS = {
  "Starter Plan": { largeCommits: 1, smallChanges: 3 },
  "Premium Plan": { largeCommits: 4, smallChanges: 6 },
  "Elite Plan": { largeCommits: 8, smallChanges: null }, // null = unlimited
  "To be discussed": { largeCommits: 0, smallChanges: 0 },
};

const PLAN_INVOICE_AMOUNTS = {
  "Starter Plan": 1499,
  "Premium Plan": 2999,
  "Elite Plan": 5999,
  "To be discussed": 0,
};

const LIFECYCLE_PHASES = [
  { value: "lead", label: "Lead" },
  { value: "consultation", label: "Consultation" },
  { value: "quotation-sent", label: "Quotation Sent" },
  { value: "negotiation", label: "Negotiation" },
  { value: "awaiting-payment", label: "Awaiting Payment" },
  { value: "project-started", label: "Project Started" },
  { value: "development", label: "Development" },
  { value: "internal-testing", label: "Internal Testing" },
  { value: "client-review", label: "Client Review" },
  { value: "ready-deployment", label: "Ready for Deployment" },
  { value: "live", label: "Live" },
  { value: "maintenance", label: "Maintenance" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const WEBSITE_STATUSES = [
  { value: "building", label: "Building" },
  { value: "testing", label: "Testing" },
  { value: "live", label: "Live" },
  { value: "maintenance", label: "Maintenance" },
  { value: "paused", label: "Paused" },
  { value: "offline", label: "Offline" },
  { value: "migrating", label: "Migrating" },
  { value: "archived", label: "Archived" },
];

const PAYMENT_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "suspended", label: "Suspended" },
  { value: "refunded", label: "Refunded" },
];

function getRequestBaseDate(request) {
  const source = request?.createdAt || request?.date;
  const parsed = source ? new Date(source) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

function addOneMonth(date) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function formatDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-IN", {
    year: "numeric", month: "short", day: "numeric",
  }) + " " + parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function formatDateOnly(value) {
  if (!value) return "";
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function toDateInputValue(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function formatCurrency(amount) {
  const numeric = Math.floor(Number(amount || 0));
  
  // Format to standard Indian numbering format (e.g., 1,00,000) using basic regex
  let clearString = numeric.toString();
  const lastThree = clearString.substring(clearString.length - 3);
  const otherBits = clearString.substring(0, clearString.length - 3);
  
  if (otherBits !== '') {
    clearString = otherBits.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
  }
  
  // Return pure standard ASCII characters only
  return `INR ${clearString}`;
}

function getDefaultInvoiceAmount(planName, request) {
  const requestAmount = Number(request?.amount ?? request?.planAmount);
  if (Number.isFinite(requestAmount) && requestAmount > 0) return requestAmount;
  return PLAN_INVOICE_AMOUNTS[planName] ?? 0;
}

function getInvoiceDraftFromRequest(request) {
  const billingStartDate =
    request.billingStartDate ||
    request.liveDate ||
    request.createdAt ||
    request.date ||
    new Date().toISOString();
  const billingEndDate =
    request.billingEndDate ||
    addOneMonth(new Date(billingStartDate)).toISOString();

  return {
    requestId: request.id,
    clientName: request.name || "",
    clientEmail: request.email || "",
    clientPhone: request.phone || "",
    clientOrganization: request.orgType || request.organizationType || "",
    clientIndustry: request.industry || "",
    projectName: request.projectTitle || request.name || "",
    projectDescription: request.projectDescription || "",
    companySize: request.companySize || "",
    planName: request.plan || "",
    amount: String(getDefaultInvoiceAmount(request.plan, request)),
    billingStartDate: toDateInputValue(billingStartDate),
    billingEndDate: toDateInputValue(billingEndDate),
    status: "unpaid",
    paymentMethod: "",
    transactionReference: "",
  };
}

async function loadImageAsDataUrl(src) {
  const response = await fetch(src);
  if (!response.ok) return null;
  const blob = await response.blob();

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function normalizeStatusLabel(status) {
  return String(status || "unpaid").toLowerCase() === "paid"
    ? "Paid"
    : "Unpaid";
}

function buildInvoiceMessage(invoice) {
  const start = formatDateOnly(invoice.billingStartDate) || "—";
  const end = formatDateOnly(invoice.billingEndDate) || "—";
  const statusLabel = normalizeStatusLabel(invoice.status);
  const pdfLink = invoice.pdfUrl
    ? `\n\nYou can find your invoice here: ${invoice.pdfUrl}`
    : `\n\nInvoice ID: ${invoice.invoiceId}`;

  return `Congratulations on your project, ${invoice.clientName || "Client"}!\n\nYour SHIELD service has been successfully set up and is now active.\n\nHere are your billing details:\n- Plan: ${invoice.planName || "—"}\n- Amount: ${formatCurrency(invoice.amount)}\n- Billing Period: ${start} to ${end}\n- Status: ${statusLabel}${pdfLink}\n\nLet me know once payment is completed (if pending), or if you need any support.\n\n— SHIELD`;
}

function buildShortInvoiceMessage(invoice) {
  const start = formatDateOnly(invoice.billingStartDate) || "—";
  const end = formatDateOnly(invoice.billingEndDate) || "—";
  return `Hi ${invoice.clientName || "Client"}, your SHIELD plan (${invoice.planName || "—"}) is active.\nAmount: ${formatCurrency(invoice.amount)}\nBilling: ${start} → ${end}\nInvoice ID: ${invoice.invoiceId}\nLet me know once done.`;
}

async function buildInvoicePdf(invoice) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });

  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const m = 16;
  const cw = pw - m * 2;

  pdf.setLineHeightFactor(1.3);

  // Dark background
  pdf.setFillColor(18, 18, 18);
  pdf.rect(0, 0, pw, ph, "F");

  // Gold accent bar at top
  pdf.setFillColor(202, 169, 76);
  pdf.rect(0, 0, pw, 3, "F");

  // Logo
  let shieldLogoB64 = null;
  try {
    const resp = await fetch("/logo.png");
    if (resp.ok) {
      const blob = await resp.blob();
      shieldLogoB64 = await new Promise(resolve => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result.split(",", 2)[1]);
        r.readAsDataURL(blob);
      });
    }
  } catch (e) { /* logo unavailable */ }
  if (shieldLogoB64) {
    try { pdf.addImage(shieldLogoB64, "PNG", m, 10, 18, 18); } catch (e) { console.warn("PDF logo failed:", e); }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(202, 169, 76);
  pdf.text("SHIELD INTELLIGENCE", m + 24, 18);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(202, 169, 76, 0.6);
  pdf.text("Securing Tomorrow with Strategic Intelligence.", m + 24, 24);

  // Business info
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(140, 140, 140);
  pdf.text("SHIELD Intelligence | queriesshield@gmail.com", m + 24, 29);
  pdf.text("Haldwani, Uttarakhand, India", m + 24, 33);

  // Gold divider
  pdf.setDrawColor(202, 169, 76);
  pdf.setLineWidth(0.4);
  pdf.line(m, 38, pw - m, 38);

  // ── INVOICE TITLE + META ──
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.setTextColor(202, 169, 76);
  pdf.text("INVOICE", m, 56);

  const invoiceDateStr = invoice.createdAt || new Date().toISOString();
  const metaX = pw - m;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(160, 160, 160);
  pdf.text(`Invoice ID:`, metaX, 50, { align: "right" });
  pdf.setTextColor(220, 220, 220);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(invoice.invoiceId || "—", metaX, 56, { align: "right" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(160, 160, 160);
  pdf.text(`Date Issued:`, metaX, 64, { align: "right" });
  pdf.setTextColor(220, 220, 220);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(formatDateOnly(invoiceDateStr), metaX, 70, { align: "right" });

  // Status badge
  const statusPaid = normalizeStatusLabel(invoice.status) === "Paid";
  const badgeText = statusPaid ? "PAID" : "UNPAID";
  pdf.setFillColor(...(statusPaid ? [21, 128, 61] : [180, 100, 20]));
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  const bw = pdf.getTextWidth(badgeText) + 10;
  const bh = 6;
  pdf.roundedRect(metaX - bw, 74, bw, bh, 2, 2, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.text(badgeText, metaX - bw / 2, 74 + 4.5, { align: "center" });

  // ── BILL TO ──
  let cy = 92;
  pdf.setFillColor(30, 30, 30);
  pdf.roundedRect(m, cy, cw, 34, 4, 4, "F");
  pdf.setDrawColor(202, 169, 76, 0.25);
  pdf.roundedRect(m, cy, cw, 34, 4, 4, "S");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(202, 169, 76);
  pdf.text("BILL TO", m + 12, cy + 8);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(220, 220, 220);
  pdf.text(invoice.clientName || "—", m + 12, cy + 18);

  pdf.setFontSize(8);
  pdf.setTextColor(160, 160, 160);
  if (invoice.clientEmail) pdf.text(invoice.clientEmail, m + 12, cy + 26);
  if (invoice.clientPhone) pdf.text(invoice.clientPhone, m + 80, cy + 26);

  if (invoice.clientOrganization || invoice.clientIndustry) {
    const orgLine = [invoice.clientOrganization, invoice.clientIndustry].filter(Boolean).join(" | ");
    pdf.setTextColor(160, 160, 160);
    pdf.setFontSize(8);
    pdf.text(orgLine, pw - m - 12, cy + 18, { align: "right" });
  }

  // ── PROJECT INFO ──
  cy += 40;
  if (invoice.projectName) {
    const projH = 22;
    pdf.setFillColor(30, 30, 30);
    pdf.roundedRect(m, cy, cw, projH, 4, 4, "F");
    pdf.setDrawColor(202, 169, 76, 0.25);
    pdf.roundedRect(m, cy, cw, projH, 4, 4, "S");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(202, 169, 76);
    pdf.text("PROJECT", m + 12, cy + 8);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(220, 220, 220);
    pdf.text(invoice.projectName, m + 12, cy + 18);

    if (invoice.companySize) {
      pdf.setFontSize(8);
      pdf.setTextColor(160, 160, 160);
      pdf.text(`Size: ${invoice.companySize}`, pw - m - 12, cy + 18, { align: "right" });
    }

    cy += projH + 4;
  }

  // ── INVOICE DETAILS TABLE ──
  cy += 4;
  const col1X = m + 12;
  const col2X = m + 60;
  const col3X = m + 100;
  const col4X = pw - m - 12;
  const rowH = 7;

  // Table header
  pdf.setFillColor(40, 40, 40);
  pdf.rect(m, cy, cw, rowH + 4, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(202, 169, 76);
  pdf.text("DESCRIPTION", col1X, cy + rowH);
  pdf.text("PERIOD", col2X, cy + rowH);
  pdf.text("RATE", col3X, cy + rowH);
  pdf.text("AMOUNT", col4X, cy + rowH, { align: "right" });

  cy += rowH + 4;
  pdf.setFillColor(24, 24, 24);
  pdf.rect(m, cy, cw, rowH + 6, "F");

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(220, 220, 220);
  pdf.text(invoice.planName || "Service Plan", col1X, cy + rowH);

  const period = `${formatDateOnly(invoice.billingStartDate) || "—"} to ${formatDateOnly(invoice.billingEndDate) || "—"}`;
  pdf.setFontSize(7);
  pdf.setTextColor(160, 160, 160);
  pdf.text(period, col2X, cy + rowH);

  pdf.setFontSize(9);
  pdf.setTextColor(200, 200, 200);
  pdf.text(formatCurrency(invoice.amount), col3X, cy + rowH);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(202, 169, 76);
  pdf.text(formatCurrency(invoice.amount), col4X, cy + rowH, { align: "right" });

  // ── TOTAL ROW ──
  cy += rowH + 6;
  pdf.setFillColor(40, 40, 40);
  pdf.rect(m, cy, cw, rowH + 4, "F");
  pdf.setDrawColor(202, 169, 76, 0.5);
  pdf.line(m, cy, pw - m, cy);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(202, 169, 76);
  pdf.text("TOTAL", col1X, cy + rowH);
  pdf.setFontSize(11);
  pdf.text(formatCurrency(invoice.amount), col4X, cy + rowH, { align: "right" });

  // ── PAYMENT INFO ──
  cy += rowH + 10;
  pdf.setFillColor(30, 30, 30);
  pdf.roundedRect(m, cy, cw, 26, 4, 4, "F");
  pdf.setDrawColor(202, 169, 76, 0.2);
  pdf.roundedRect(m, cy, cw, 26, 4, 4, "S");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(202, 169, 76);
  pdf.text("PAYMENT INFORMATION", m + 12, cy + 8);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(160, 160, 160);
  pdf.text(`Method: ${invoice.paymentMethod || "—"}`, m + 12, cy + 18);
  pdf.text(`Reference: ${invoice.transactionReference || "—"}`, pw - m - 12, cy + 18, { align: "right" });

  // ── FOOTER ──
  pdf.setDrawColor(202, 169, 76, 0.3);
  pdf.setLineWidth(0.3);
  pdf.line(m, ph - 24, pw - m, ph - 24);

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text("SHIELD Intelligence — Building secure software, authentication tools, and privacy-focused digital systems.", m, ph - 18);
  pdf.text("Contact: queriesshield@gmail.com", m, ph - 13);

  pdf.setTextColor(202, 169, 76, 0.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("Thank you for your business", pw - m, ph - 13, { align: "right" });

  // Gold accent bar at bottom
  pdf.setFillColor(202, 169, 76);
  pdf.rect(0, ph - 2, pw, 2, "F");

  pdf.save(`${invoice.invoiceId || "SHIELD-invoice"}.pdf`);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDaysRemaining(endDateValue) {
  if (!endDateValue) return null;
  const endDate = new Date(endDateValue);
  if (Number.isNaN(endDate.getTime())) return null;
  const diffMs =
    startOfDay(endDate).getTime() - startOfDay(new Date()).getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function dateKey(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function sameBillingCycle(request, invoice) {
  return (
    dateKey(request?.billingStartDate) === dateKey(invoice?.billingStartDate) &&
    dateKey(request?.billingEndDate) === dateKey(invoice?.billingEndDate)
  );
}

const ServiceRequestsTab = ({
  data = [],
  invoicesData = [],
  onDelete,
  onUpdatePlan,
  onUpdateStatus,
  focusRequestId,
}) => {
  const [menuOpen, setMenuOpen] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const menuTriggerRef = useRef(null);
  const closeMenu = () => { setMenuOpen(null); setMenuPos(null); menuTriggerRef.current = null; };
  const recalcMenu = () => {
    if (!menuTriggerRef.current) return;
    const rect = menuTriggerRef.current.getBoundingClientRect();
    const menuW = 220;
    let top = rect.bottom + 4;
    let left = rect.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    if (top + 400 > window.innerHeight) {
      if (rect.top > 400) {
        top = rect.top - 400 - 4;
      } else {
        top = 4;
      }
    }
    setMenuPos({ top, left });
  };

  const recordTimelineEvent = async (requestId, action, notes = "") => {
    if (!requestId) return;
    try {
      const ref = doc(db, "serviceRequests", requestId);
      await updateDoc(ref, {
        timeline: arrayUnion({
          timestamp: new Date().toISOString(),
          action,
          notes: notes || "",
        }),
      });
    } catch (e) {
      console.error("Failed to record timeline event:", e);
    }
  };

  const [query, setQuery] = useState("");
  const [filterSource, setFilterSource] = useState("any");
  const [filterAccepted, setFilterAccepted] = useState("any");
  const [filterPlan, setFilterPlan] = useState("any");
  const [filterRequestStatus, setFilterRequestStatus] = useState("any");
  const [filterBillingState, setFilterBillingState] = useState("any");
  const [sortBy, setSortBy] = useState("createdDesc");
  const [updatePlanModal, setUpdatePlanModal] = useState(null);
  const [newPlan, setNewPlan] = useState("");
  const [creditModal, setCreditModal] = useState(null);
  const [requestCredits, setRequestCredits] = useState({});
  const [notesDrafts, setNotesDrafts] = useState({});
  const [notesDirty, setNotesDirty] = useState({});
  const [notesSaving, setNotesSaving] = useState({});
  const [websiteBuildingDrafts, setWebsiteBuildingDrafts] = useState({});
  const [websiteBuildingDirty, setWebsiteBuildingDirty] = useState({});
  const [websiteBuildingSaving, setWebsiteBuildingSaving] = useState({});
  const [focusedCardId, setFocusedCardId] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState({
    open: false,
    mode: "edit",
    draft: null,
    invoiceId: null,
    saving: false,
  });
  const [confirmModal, setConfirmModal] = useState({ open: false });
  const [editModal, setEditModal] = useState({ open: false, saving: false, request: null });
  const [editForm, setEditForm] = useState({});
  const [customModal, setCustomModal] = useState({ open: false, saving: false });
  const [customForm, setCustomForm] = useState({
    name: "",
    email: "",
    preferredContact: "",
    otherContacts: "",
    plan: "To be discussed",
    billingCycle: "Monthly",
    source: "custom",
    requirements: "",
    projectReference: "",
    customMonthlyPrice: "",
    buildCost: "",
    billingStartDate: "",
    billingEndDate: "",
    acceptedTerms: true,
  });

  const anyModalOpen =
    !!menuOpen ||
    !!updatePlanModal ||
    !!creditModal ||
    !!invoiceModal.open ||
    !!customModal.open ||
    !!editModal.open ||
    !!confirmModal.open;

  const toggleMenu = (index, event) => {
    if (menuOpen === index) { closeMenu(); return; }
    menuTriggerRef.current = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();
    const menuW = 220;
    let top = rect.bottom + 4;
    let left = rect.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    if (top + 400 > window.innerHeight) {
      if (rect.top > 400) {
        top = rect.top - 400 - 4;
      } else {
        top = 4;
      }
    }
    setMenuPos({ top, left });
    setMenuOpen(index);
  };

  useEffect(() => {
    if (!menuOpen && !menuPos) return;
    const handleClick = (e) => {
      if (!e.target.closest(".menu-container") && !e.target.closest(".menu-dropdown")) {
        closeMenu();
      }
    };
    const handleScroll = () => recalcMenu();
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", recalcMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", recalcMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menuOpen, menuPos]);

  // Disable dashboard elevation while modal is open to avoid hover flicker
  useEffect(() => {
    const el = document.getElementById("dashboard-screen");
    if (!el) return;
    if (anyModalOpen) {
      el.classList.add("no-elevate");
    } else {
      el.classList.remove("no-elevate");
    }
    return () => el.classList.remove("no-elevate");
  }, [anyModalOpen]);

  // Initialize local credits map from incoming data (if documents already have `credits`)
  useEffect(() => {
    if (!data || !data.length) return;
    const map = {};
    data.forEach((r) => {
      if (r.id && r.credits) {
        map[r.id] = {
          largeCommits: Number(r.credits.largeCommits || 0),
          smallChanges: Number(r.credits.smallChanges || 0),
        };
      }
    });
    if (Object.keys(map).length)
      setRequestCredits((prev) => ({ ...prev, ...map }));
  }, [data]);

  useEffect(() => {
    if (!data || !data.length) return;

    setNotesDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      data.forEach((request) => {
        if (!request?.id || notesDirty[request.id]) return;
        const incoming = String(request.notes || "");
        if (next[request.id] !== incoming) {
          next[request.id] = incoming;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [data, notesDirty]);

  useEffect(() => {
    if (!data || !data.length) return;

    setWebsiteBuildingDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      data.forEach((request) => {
        if (!request?.id || websiteBuildingDirty[request.id]) return;
        const incoming = !!request.includesWebsiteBuilding;
        if (next[request.id] !== incoming) {
          next[request.id] = incoming;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [data, websiteBuildingDirty]);

  useEffect(() => {
    if (!focusRequestId) return;
    const el = document.getElementById(`service-request-${focusRequestId}`);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setFocusedCardId(focusRequestId);
    const timer = window.setTimeout(() => setFocusedCardId(null), 2200);
    return () => window.clearTimeout(timer);
  }, [focusRequestId]);

  const handleUpdatePlan = (request) => {
    setUpdatePlanModal(request);
    setNewPlan(request.plan || "");
    closeMenu();
  };

  const handleOpenCreditModal = (request) => {
    setCreditModal(request);
    if (!requestCredits[request.id]) {
      setRequestCredits((prev) => ({
        ...prev,
        [request.id]: { largeCommits: 0, smallChanges: 0 },
      }));
    }
    closeMenu();
  };

  function getAlertType(daysRemaining) {
    if (daysRemaining === null) return null;
    if (daysRemaining <= 0) return "expired";
    if (daysRemaining <= 2) return "2_day_warning";
    if (daysRemaining <= 5) return "5_day_warning";
    if (daysRemaining <= 10) return "10_day_warning";
    return null;
  }
  const invoicesByRequest = useMemo(() => {
    const map = {};
    (invoicesData || []).forEach((invoice) => {
      const key = invoice.requestId;
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(invoice);
    });

    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) => {
        const aTime = new Date(
          a.createdAt || a.billingStartDate || 0,
        ).getTime();
        const bTime = new Date(
          b.createdAt || b.billingStartDate || 0,
        ).getTime();
        return bTime - aTime;
      });
    });

    return map;
  }, [invoicesData]);

  const invoiceStatsByRequest = useMemo(() => {
    const map = {};

    (data || []).forEach((request) => {
      const requestInvoices = invoicesByRequest[request.id] || [];
      const unpaidInvoices = requestInvoices.filter(
        (invoice) =>
          String(invoice.status || "unpaid").toLowerCase() === "unpaid",
      );
      const currentCycleUnpaidInvoice =
        unpaidInvoices.find((invoice) => sameBillingCycle(request, invoice)) ||
        null;

      map[request.id] = {
        requestInvoices,
        unpaidInvoices,
        unpaidCount: unpaidInvoices.length,
        hasUnpaidInvoice: unpaidInvoices.length > 0,
        currentCycleUnpaidInvoice,
      };
    });

    return map;
  }, [data, invoicesByRequest]);

  const openInvoiceModal = (invoice, mode = "edit") => {
    if (!invoice) return;
    setInvoiceModal({
      open: true,
      mode,
      invoiceId: invoice.id,
      requestId: invoice.requestId || "",
      draft: {
        clientName: invoice.clientName || "",
        clientEmail: invoice.clientEmail || "",
        clientPhone: invoice.clientPhone || "",
        clientOrganization: invoice.clientOrganization || "",
        clientIndustry: invoice.clientIndustry || "",
        projectName: invoice.projectName || "",
        projectDescription: invoice.projectDescription || "",
        companySize: invoice.companySize || "",
        planName: invoice.planName || "",
        amount: String(invoice.amount ?? ""),
        billingStartDate: toDateInputValue(invoice.billingStartDate),
        billingEndDate: toDateInputValue(invoice.billingEndDate),
        status: mode === "markPaid" ? "paid" : invoice.status || "unpaid",
        paymentMethod: invoice.paymentMethod || "",
        transactionReference: invoice.transactionReference || "",
      },
      saving: false,
    });
  };

  const openGenerateInvoiceModal = (request) => {
    if (!request?.id) return;
    setInvoiceModal({
      open: true,
      mode: "generate",
      requestId: request.id,
      requestName: request.name || "",
      draft: getInvoiceDraftFromRequest(request),
      saving: false,
    });
  };

  const closeInvoiceModal = () => {
    setInvoiceModal({
      open: false,
      mode: "edit",
      draft: null,
      invoiceId: null,
      requestId: null,
      requestName: "",
      saving: false,
    });
  };

  const updateInvoiceDraft = (field, value) => {
    setInvoiceModal((prev) => ({
      ...prev,
      draft: {
        ...(prev.draft || {}),
        [field]: value,
      },
    }));
  };

  const generateInvoiceForRequest = async (request) => {
    if (!request?.id) return;
    if (invoiceStatsByRequest[request.id]?.currentCycleUnpaidInvoice) {
      const existingInvoice =
        invoiceStatsByRequest[request.id].currentCycleUnpaidInvoice;
      showConfirm({
        title: "Invoice Already Exists",
        message: `An unpaid invoice already exists for this billing cycle${existingInvoice?.invoiceId ? ` (${existingInvoice.invoiceId})` : ""}. Update the existing invoice instead of creating a duplicate.`,
        cancelLabel: "OK",
      });
      return;
    }

    openGenerateInvoiceModal(request);
  };

  const saveInvoiceModal = async () => {
    if (!invoiceModal.open || !invoiceModal.draft) return;

    const nextAmount = Number(invoiceModal.draft.amount || 0);
    const nextStart = parseDateInputValue(invoiceModal.draft.billingStartDate);
    const nextEnd = parseDateInputValue(invoiceModal.draft.billingEndDate);
    const nextStatus =
      String(invoiceModal.draft.status || "unpaid").toLowerCase() === "paid"
        ? "paid"
        : "unpaid";

    setInvoiceModal((prev) => ({ ...prev, saving: true }));
    try {
      if (invoiceModal.mode === "generate") {
        const request = data.find((item) => item.id === invoiceModal.requestId);
        if (
          request &&
          invoiceStatsByRequest[request.id]?.currentCycleUnpaidInvoice
        ) {
          throw new Error(
            "An unpaid invoice already exists for this billing cycle.",
          );
        }

        const invoiceRef = doc(invoicesCollection);
        const counterRef = doc(db, "system", "invoiceCounter");
        let createdInvoiceId = "";

        await runTransaction(db, async (transaction) => {
          const counterSnap = await transaction.get(counterRef);
          const lastNumber = counterSnap.exists()
            ? Number(counterSnap.data()?.lastInvoiceNumber || 0)
            : 0;
          const nextNumber = lastNumber + 1;
          createdInvoiceId = `SHIELD-${String(nextNumber).padStart(4, "0")}`;

          const invoiceData = {
            requestId: invoiceModal.requestId || "",
            invoiceId: createdInvoiceId,
            clientName: invoiceModal.draft.clientName || "",
            clientEmail: invoiceModal.draft.clientEmail || "",
            clientPhone: invoiceModal.draft.clientPhone || "",
            clientOrganization: invoiceModal.draft.clientOrganization || "",
            clientIndustry: invoiceModal.draft.clientIndustry || "",
            projectName: invoiceModal.draft.projectName || "",
            projectDescription: invoiceModal.draft.projectDescription || "",
            companySize: invoiceModal.draft.companySize || "",
            planName: invoiceModal.draft.planName || "",
            amount: Number.isFinite(nextAmount) ? nextAmount : 0,
            billingStartDate: nextStart,
            billingEndDate: nextEnd,
            status: nextStatus,
            paymentMethod: invoiceModal.draft.paymentMethod || "",
            transactionReference: invoiceModal.draft.transactionReference || "",
            createdAt: new Date().toISOString(),
          };

          transaction.set(invoiceRef, invoiceData);
          if (counterSnap.exists()) {
            transaction.update(counterRef, {
              lastInvoiceNumber: nextNumber,
              updatedAt: new Date().toISOString(),
            });
          } else {
            transaction.set(counterRef, {
              lastInvoiceNumber: nextNumber,
              updatedAt: new Date().toISOString(),
            });
          }
        });

        closeInvoiceModal();
        showConfirm({
          title: "Done",
          message: `Invoice generated${createdInvoiceId ? ` (${createdInvoiceId})` : ""}.`,
          cancelLabel: "OK",
        });
        await recordTimelineEvent(
          invoiceModal.requestId,
          `Invoice generated (${createdInvoiceId})`,
        );
      } else {
        const invoiceRef = doc(db, "invoices", invoiceModal.invoiceId);
        const requestRef = invoiceModal.requestId
          ? doc(db, "serviceRequests", invoiceModal.requestId)
          : null;

        await runTransaction(db, async (transaction) => {
          transaction.update(invoiceRef, {
            clientName: invoiceModal.draft.clientName || "",
            clientEmail: invoiceModal.draft.clientEmail || "",
            clientPhone: invoiceModal.draft.clientPhone || "",
            clientOrganization: invoiceModal.draft.clientOrganization || "",
            clientIndustry: invoiceModal.draft.clientIndustry || "",
            projectName: invoiceModal.draft.projectName || "",
            projectDescription: invoiceModal.draft.projectDescription || "",
            companySize: invoiceModal.draft.companySize || "",
            planName: invoiceModal.draft.planName || "",
            amount: Number.isFinite(nextAmount) ? nextAmount : 0,
            billingStartDate: nextStart,
            billingEndDate: nextEnd,
            status: nextStatus,
            paymentMethod: invoiceModal.draft.paymentMethod || "",
            transactionReference: invoiceModal.draft.transactionReference || "",
            updatedAt: new Date().toISOString(),
          });

          const linkedRequest = requestRef
            ? data.find((item) => item.id === invoiceModal.requestId)
            : null;

          if (nextStatus === "paid" && requestRef && !linkedRequest?.isPaused) {
            const cycleStart = nextEnd || new Date().toISOString();
            const cycleEnd = addOneMonth(new Date(cycleStart)).toISOString();

            transaction.update(requestRef, {
              status: "active",
              requesterStatus: "Active",
              billingStartDate: cycleStart,
              billingEndDate: cycleEnd,
              liveDate: cycleStart,
              renewalDate: cycleEnd,
            });
          }
        });

        closeInvoiceModal();
        showConfirm({
          title: "Done",
          message:
            nextStatus === "paid"
              ? requestRef &&
                data.find((item) => item.id === invoiceModal.requestId)
                  ?.isPaused
                ? "Invoice paid. Billing cycle was not advanced because the website is paused."
                : "Invoice paid and billing cycle renewed."
              : "Invoice updated.",
          cancelLabel: "OK",
        });
        if (nextStatus === "paid") {
          await recordTimelineEvent(
            invoiceModal.requestId,
            "Invoice paid",
          );
        }
      }
    } catch (err) {
      console.error("Failed to update invoice:", err);
      showConfirm({
        title: "Error",
        message: "Failed to update invoice. Please try again.",
        cancelLabel: "OK",
      });
    } finally {
      setInvoiceModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const copyToClipboard = async (text, successMessage) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      showConfirm({
        title: "Done",
        message: successMessage,
        cancelLabel: "OK",
      });
    } catch (err) {
      console.error("Failed to copy text:", err);
      showConfirm({
        title: "Error",
        message: "Failed to copy message. Please try again.",
        cancelLabel: "OK",
      });
    }
  };

  const handleCopyInvoiceMessage = (invoice) =>
    copyToClipboard(buildInvoiceMessage(invoice), "Message copied");
  const handleCopyShortInvoiceMessage = (invoice) =>
    copyToClipboard(buildShortInvoiceMessage(invoice), "Message copied");
  const handleDownloadInvoice = async (invoice) => buildInvoicePdf(invoice);

  const handleViewRequest = (requestId) => {
    if (!requestId) return;
    closeMenu();
    setUpdatePlanModal(null);
    setCreditModal(null);
    setInvoiceModal({
      open: false,
      mode: "edit",
      draft: null,
      invoiceId: null,
      requestId: null,
      requestName: "",
      saving: false,
    });
    const el = document.getElementById(`service-request-${requestId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setFocusedCardId(requestId);
      window.setTimeout(() => setFocusedCardId(null), 2200);
    }
  };

  const handlePauseWebsite = async (request, shouldPause) => {
    if (!request?.id) return;

    showConfirm({
      title: shouldPause ? "Pause Website" : "Resume Website",
      message: shouldPause
        ? `Pause billing updates for ${request.name || request.email || request.id}? The request status will stay as-is.`
        : `Resume billing updates for ${request.name || request.email || request.id}?`,
      confirmLabel: shouldPause ? "Pause" : "Resume",
      cancelLabel: "Cancel",
      destructive: shouldPause,
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "serviceRequests", request.id), {
            isPaused: shouldPause,
            pausedAt: shouldPause ? new Date().toISOString() : null,
          });
          await recordTimelineEvent(
            request.id,
            shouldPause ? "Website paused" : "Website resumed",
          );
          closeConfirm();
          showConfirm({
            title: shouldPause ? "Paused" : "Resumed",
            message: shouldPause
              ? "Website billing updates are paused."
              : "Website billing updates are active again.",
            cancelLabel: "OK",
          });
          closeMenu();
        } catch (err) {
          console.error("Failed to update pause state:", err);
          closeConfirm();
          showConfirm({
            title: "Error",
            message: "Failed to update pause state. Please try again.",
            cancelLabel: "OK",
          });
        }
      },
    });
  };

  const handleDeleteInvoice = (invoice) => {
    if (!invoice?.id) return;

    showConfirm({
      title: "Delete Invoice",
      message: `Delete invoice ${invoice.invoiceId || invoice.id}? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "invoices", invoice.id));
          closeConfirm();
          showConfirm({
            title: "Deleted",
            message: "Invoice deleted.",
            cancelLabel: "OK",
          });
        } catch (err) {
          console.error("Failed to delete invoice:", err);
          closeConfirm();
          showConfirm({
            title: "Error",
            message: "Failed to delete invoice. Please try again.",
            cancelLabel: "OK",
          });
        }
      },
    });
  };

  const handleNotesChange = (requestId, value) => {
    setNotesDrafts((prev) => ({
      ...prev,
      [requestId]: value,
    }));
    setNotesDirty((prev) => ({
      ...prev,
      [requestId]: true,
    }));
  };

  const handleSaveNotes = async (request) => {
    if (!request?.id) return;

    const draft = String(notesDrafts[request.id] ?? request.notes ?? "");
    const persisted = String(request.notes ?? "");
    if (draft === persisted) return;

    setNotesSaving((prev) => ({ ...prev, [request.id]: true }));
    try {
      await updateDoc(doc(db, "serviceRequests", request.id), {
        notes: draft,
        notesUpdatedAt: new Date().toISOString(),
      });

      setNotesDirty((prev) => ({
        ...prev,
        [request.id]: false,
      }));
    } catch (err) {
      console.error("Failed to save request notes:", err);
      showConfirm({
        title: "Error",
        message: "Failed to save notes. Please try again.",
        cancelLabel: "OK",
      });
    } finally {
      setNotesSaving((prev) => ({ ...prev, [request.id]: false }));
    }
  };

  const handleWebsiteBuildingToggle = async (request, nextValue) => {
    if (!request?.id) return;

    const baseDate = getRequestBaseDate(request);
    const nextBillingStartDate = nextValue
      ? addOneMonth(baseDate).toISOString()
      : null;

    setWebsiteBuildingDrafts((prev) => ({
      ...prev,
      [request.id]: nextValue,
    }));
    setWebsiteBuildingDirty((prev) => ({
      ...prev,
      [request.id]: true,
    }));
    setWebsiteBuildingSaving((prev) => ({
      ...prev,
      [request.id]: true,
    }));

    try {
      await updateDoc(doc(db, "serviceRequests", request.id), {
        includesWebsiteBuilding: nextValue,
        billingStartDate: nextBillingStartDate,
      });

      setWebsiteBuildingDirty((prev) => ({
        ...prev,
        [request.id]: false,
      }));
    } catch (err) {
      console.error("Failed to save website-building toggle:", err);
      setWebsiteBuildingDrafts((prev) => ({
        ...prev,
        [request.id]: !!request.includesWebsiteBuilding,
      }));
      setWebsiteBuildingDirty((prev) => ({
        ...prev,
        [request.id]: false,
      }));
      showConfirm({
        title: "Error",
        message: "Failed to update website building setting. Please try again.",
        cancelLabel: "OK",
      });
    } finally {
      setWebsiteBuildingSaving((prev) => ({
        ...prev,
        [request.id]: false,
      }));
    }
  };

  const showConfirm = ({
    title,
    message,
    onConfirm,
    confirmLabel,
    cancelLabel,
    destructive,
  }) => {
    setConfirmModal({
      open: true,
      title,
      message,
      onConfirm,
      confirmLabel,
      cancelLabel,
      destructive,
    });
  };

  const closeConfirm = () => setConfirmModal({ open: false });

  const normalizeEmailLocal = (email) =>
    String(email || "")
      .trim()
      .toLowerCase();

  const handleEditRequest = (request) => {
    if (!request) return;
    setEditForm({
      name: request.name || "",
      email: request.email || "",
      preferredContact: request.preferredContact || "",
      otherContacts: request.otherContacts || "",
      plan: request.plan || "To be discussed",
      billingCycle: request.billingCycle || "Monthly",
      requirements: request.requirements || "",
      projectReference: request.projectReference || "",
      source: request.source || "",
      customMonthlyPrice: request.customMonthlyPrice || "",
      buildCost: request.buildCost || "",
      acceptedTerms: request.acceptedTerms !== false,
      billingStartDate: request.billingStartDate ? request.billingStartDate.slice(0, 10) : "",
      billingEndDate: request.billingEndDate ? request.billingEndDate.slice(0, 10) : "",
    });
    setEditModal({ open: true, saving: false, request });
  };

  const handleClearPlan = async (request) => {
    if (!request || !request.id) return;

    showConfirm({
      title: "Clear Plan Details",
      message: `Clear plan details and reset credits for ${request.name || request.email || request.id}?`,
      confirmLabel: "Clear Plan",
      cancelLabel: "Cancel",
      destructive: true,
      onConfirm: async () => {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const newCredits = {
          largeCommits: 0,
          smallChanges: 0,
          lastResetMonth: currentMonth,
        };
        try {
          await updateDoc(doc(db, "serviceRequests", request.id), {
            plan: "To be discussed",
            billingCycle: null,
            includesWebsiteBuilding: false,
            billingStartDate: null,
            credits: newCredits,
          });
          // update local UI state
          setRequestCredits((prev) => ({
            ...prev,
            [request.id]: { largeCommits: 0, smallChanges: 0 },
          }));
          setWebsiteBuildingDrafts((prev) => ({
            ...prev,
            [request.id]: false,
          }));
          setWebsiteBuildingDirty((prev) => ({ ...prev, [request.id]: false }));
          closeConfirm();
          showConfirm({
            title: "Done",
            message: "Plan cleared and credits reset.",
            cancelLabel: "OK",
          });
        } catch (err) {
          console.error("Failed to clear plan details:", err);
          closeConfirm();
          showConfirm({
            title: "Error",
            message: "Failed to clear plan. Check console for details.",
            cancelLabel: "OK",
          });
        }
      },
    });
  };

  const handleRemoveUser = async (request) => {
    if (!request || !request.email) {
      showConfirm({
        title: "No Email",
        message: "No user email available to remove.",
        cancelLabel: "OK",
      });
      return;
    }
    const emailId = normalizeEmailLocal(request.email);

    showConfirm({
      title: "Remove User",
      message: `Permanently remove user ${request.email}? This cannot be undone.`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "users", emailId));
          closeConfirm();
          showConfirm({
            title: "Removed",
            message: "User removed.",
            cancelLabel: "OK",
          });
        } catch (err) {
          console.error("Failed to remove user:", err);
          closeConfirm();
          showConfirm({
            title: "Error",
            message: "Failed to remove user. Check console for details.",
            cancelLabel: "OK",
          });
        }
      },
    });
  };

  const addCredit = async (type) => {
    if (!creditModal) return;

    const plan = creditModal.plan;
    const limits = TIER_LIMITS[plan];
    if (!limits) return;

    const currentCredits = requestCredits[creditModal.id] || {
      largeCommits: 0,
      smallChanges: 0,
    };

    let newCredits = { ...currentCredits };

    if (type === "largeCommit") {
      if (
        limits.largeCommits !== null &&
        currentCredits.largeCommits >= limits.largeCommits
      ) {
        showConfirm({
          title: "Limit reached",
          message: `Large Commit limit reached (${limits.largeCommits}/${limits.largeCommits})`,
          cancelLabel: "OK",
        });
        return;
      }
      newCredits.largeCommits = currentCredits.largeCommits + 1;
    } else if (type === "smallChange") {
      if (
        limits.smallChanges !== null &&
        currentCredits.smallChanges >= limits.smallChanges
      ) {
        showConfirm({
          title: "Limit reached",
          message: `Small Change limit reached (${limits.smallChanges}/${limits.smallChanges})`,
          cancelLabel: "OK",
        });
        return;
      }
      newCredits.smallChanges = currentCredits.smallChanges + 1;
    }

    // Update local state immediately for snappy UI
    setRequestCredits((prev) => ({
      ...prev,
      [creditModal.id]: newCredits,
    }));

    // Persist to Firestore
    try {
      await updateDoc(doc(db, "serviceRequests", creditModal.id), {
        credits: newCredits,
      });
    } catch (err) {
      console.error("Failed to persist credits to Firestore:", err);
      showConfirm({
        title: "Error",
        message: "Failed to update credits in database. Please try again.",
        cancelLabel: "OK",
      });
      // revert local state on failure
      setRequestCredits((prev) => ({
        ...prev,
        [creditModal.id]: currentCredits,
      }));
    }
  };

  const removeCredit = async (type) => {
    if (!creditModal) return;

    const currentCredits = requestCredits[creditModal.id] || {
      largeCommits: 0,
      smallChanges: 0,
    };
    const original = { ...currentCredits };
    let newCredits = { ...currentCredits };

    if (type === "largeCommit") {
      if (currentCredits.largeCommits <= 0) return;
      newCredits.largeCommits = currentCredits.largeCommits - 1;
    } else if (type === "smallChange") {
      if (currentCredits.smallChanges <= 0) return;
      newCredits.smallChanges = currentCredits.smallChanges - 1;
    }

    // Update local state immediately
    setRequestCredits((prev) => ({
      ...prev,
      [creditModal.id]: newCredits,
    }));

    // Persist to Firestore
    try {
      await updateDoc(doc(db, "serviceRequests", creditModal.id), {
        credits: newCredits,
      });
    } catch (err) {
      console.error("Failed to persist credits removal to Firestore:", err);
      showConfirm({
        title: "Error",
        message: "Failed to update credits in database. Please try again.",
        cancelLabel: "OK",
      });
      // revert local state on failure
      setRequestCredits((prev) => ({
        ...prev,
        [creditModal.id]: original,
      }));
    }
  };

  const closeCreditModal = () => {
    setCreditModal(null);
  };

  // MANAGEMENT ACTIONS
  const updateStatus = async (id, newStatus) => {
    await onUpdateStatus(id, { requesterStatus: newStatus });
    await recordTimelineEvent(id, `Status changed to ${newStatus}`);
    closeMenu();
  };

  const handleMakeLive = async (request) => {
    // Logic: 90 days for quarterly, 30 for monthly/default
    const isQuarterly = request.billingCycle
      ?.toLowerCase()
      .includes("quarterly");
    const isYearly = request.billingCycle
      ?.toLowerCase()
      .includes("yearly");
    const days = isYearly ? 365 : isQuarterly ? 90 : 30;

    const billingStart =
      request.includesWebsiteBuilding && request.billingStartDate
        ? new Date(request.billingStartDate)
        : request.includesWebsiteBuilding
          ? addOneMonth(getRequestBaseDate(request))
          : new Date();

    const renewalDate = new Date(billingStart);
    renewalDate.setDate(renewalDate.getDate() + days);

    await onUpdateStatus(request.id, {
      requesterStatus: "Active",
      status: "active",
      billingStartDate: billingStart.toISOString(),
      billingEndDate: renewalDate.toISOString(),
      liveDate: new Date().toISOString(),
      renewalDate: renewalDate.toISOString(),
    });
    await recordTimelineEvent(request.id, "Project went live");
    closeMenu();
  };

  const confirmUpdatePlan = async () => {
    if (!updatePlanModal || !onUpdatePlan) return;
    try {
      await onUpdatePlan(updatePlanModal.id, newPlan);
      setUpdatePlanModal(null);
      setNewPlan("");
    } catch (error) {
      showConfirm({
        title: "Error",
        message: "Failed to update plan. Please try again.",
        cancelLabel: "OK",
      });
    }
  };

  const cancelUpdatePlan = () => {
    setUpdatePlanModal(null);
    setNewPlan("");
  };

  const filtered = useMemo(() => {
    const q = String(query || "")
      .trim()
      .toLowerCase();

    const arr = (data || []).filter((req) => {
      const requestStatus = String(req.requesterStatus || "").toLowerCase();
      const isPaused = !!req.isPaused;
      const billingDaysRemaining = getDaysRemaining(req.billingEndDate);
      const alertType = getAlertType(billingDaysRemaining);
      const invoiceStats = invoiceStatsByRequest[req.id] || {
        currentCycleUnpaidInvoice: null,
        hasUnpaidInvoice: false,
      };

      if (filterSource !== "any" && (req.source || "") !== filterSource)
        return false;

      if (filterAccepted !== "any") {
        const accepted = !!req.acceptedTerms;
        if (filterAccepted === "yes" && !accepted) return false;
        if (filterAccepted === "no" && accepted) return false;
      }

      if (filterPlan !== "any" && (req.plan || "") !== filterPlan) return false;

      if (filterRequestStatus !== "any") {
        if (filterRequestStatus === "paused" && !isPaused) return false;
        else if (filterRequestStatus === "active" && requestStatus !== "active")
          return false;
        else if (
          filterRequestStatus === "expired" &&
          requestStatus !== "expired"
        )
          return false;
        else if (
          filterRequestStatus === "building" &&
          requestStatus !== "building"
        )
          return false;
        else if (
          filterRequestStatus === "negotiating" &&
          requestStatus !== "negotiating"
        )
          return false;
        else if (
          filterRequestStatus === "in review" &&
          requestStatus !== "in review"
        )
          return false;
        else if (
          filterRequestStatus === "to be discussed" &&
          String(req.plan || "").toLowerCase() !== "to be discussed"
        )
          return false;
      }

      if (filterBillingState !== "any") {
        if (filterBillingState === "paused" && !isPaused) return false;
        if (
          filterBillingState === "expired" &&
          !(billingDaysRemaining !== null && billingDaysRemaining <= 0)
        )
          return false;
        if (
          filterBillingState === "expiring_10" &&
          alertType !== "10_day_warning"
        )
          return false;
        if (
          filterBillingState === "expiring_5" &&
          alertType !== "5_day_warning"
        )
          return false;
        if (
          filterBillingState === "expiring_2" &&
          alertType !== "2_day_warning"
        )
          return false;
        if (
          filterBillingState === "unpaid_invoice" &&
          !invoiceStats.hasUnpaidInvoice
        )
          return false;
        if (
          filterBillingState === "current_cycle_unpaid" &&
          !invoiceStats.currentCycleUnpaidInvoice
        )
          return false;
      }

      if (!q) return true;

      const requestInvoices = invoiceStats.requestInvoices || [];
      const hay = [
        req.name,
        req.email,
        req.preferredContact,
        req.otherContacts,
        req.requirements,
        req.projectReference,
        req.requesterStatus,
        req.billingCycle,
        req.plan,
        req.source,
        req.isPaused ? "paused" : "",
        requestInvoices
          .map((invoice) =>
            [
              invoice.invoiceId,
              invoice.clientName,
              invoice.clientEmail,
              invoice.transactionReference,
            ]
              .filter(Boolean)
              .join(" "),
          )
          .join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });

    if (sortBy === "createdAsc") {
      arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortBy === "createdDesc") {
      arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sortBy === "nameAsc") {
      arr.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || "")),
      );
    } else if (sortBy === "nameDesc") {
      arr.sort((a, b) =>
        String(b.name || "").localeCompare(String(a.name || "")),
      );
    }

    return arr;
  }, [
    data,
    query,
    filterSource,
    filterAccepted,
    filterPlan,
    filterRequestStatus,
    filterBillingState,
    sortBy,
    invoiceStatsByRequest,
  ]);

  return (
    <div className="service-requests-tab">
      <h2>Service Requests</h2>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
        <button
          onClick={() => {
            setCustomForm({
               name: "",
              email: "",
              preferredContact: "",
              otherContacts: "",
              plan: "To be discussed",
              billingCycle: "Monthly",
              source: "custom",
              requirements: "",
              projectReference: "",
              customMonthlyPrice: "",
              buildCost: "",
              billingStartDate: "",
              billingEndDate: "",
              acceptedTerms: true,
            });
            setCustomModal({ open: true, saving: false });
          }}
          style={{
            padding: "8px 16px",
            background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          + Create Custom Request
        </button>

      </div>

      <div className="tab-controls">
        <input
          className="search-input"
          placeholder="Search name, email, status, requirements..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <CustomDropdown
          options={[
            { value: "any", label: "Any Plan" },
            { value: "Starter Plan", label: "Starter Plan" },
            { value: "Premium Plan", label: "Premium Plan" },
            { value: "Elite Plan", label: "Elite Plan" },
            { value: "To be discussed", label: "To be discussed" },
          ]}
          selected={filterPlan}
          onChange={(v) => setFilterPlan(v)}
          placeholder="Plan"
        />

        <CustomDropdown
          options={[
            { value: "any", label: "Any Status" },
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
            { value: "expired", label: "Expired" },
            { value: "negotiating", label: "Negotiating" },
            { value: "building", label: "Building" },
            { value: "in review", label: "In Review" },
          ]}
          selected={filterRequestStatus}
          onChange={(v) => setFilterRequestStatus(v)}
          placeholder="Request Status"
        />

        <CustomDropdown
          options={[
            { value: "any", label: "Any Billing State" },
            { value: "paused", label: "Paused Billing" },
            { value: "expired", label: "Expired Billing" },
            { value: "expiring_10", label: "Expiring in 10 Days" },
            { value: "expiring_5", label: "Expiring in 5 Days" },
            { value: "expiring_2", label: "Expiring in 2 Days" },
            { value: "unpaid_invoice", label: "Has Unpaid Invoice" },
            { value: "current_cycle_unpaid", label: "Current Cycle Unpaid" },
          ]}
          selected={filterBillingState}
          onChange={(v) => setFilterBillingState(v)}
          placeholder="Billing"
        />

        <CustomDropdown
          options={[
            { value: "createdDesc", label: "Newest" },
            { value: "createdAsc", label: "Oldest" },
            { value: "nameAsc", label: "Name A→Z" },
            { value: "nameDesc", label: "Name Z→A" },
          ]}
          selected={sortBy}
          onChange={(v) => setSortBy(v)}
          placeholder="Sort"
        />

        <div className="result-count">{filtered.length} results</div>
      </div>

      {filtered.map((request, index) => {
        const src = String(request.source || "unknown");
        const srcClass = `source-${src.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
        const isOverdue =
          request.renewalDate && new Date(request.renewalDate) < new Date();
        const includesWebsiteBuilding =
          websiteBuildingDrafts[request.id] ??
          !!request.includesWebsiteBuilding;
        const isLive =
          String(request.requesterStatus || "").toLowerCase() === "active";
        const billingStartDate = request.billingStartDate
          ? new Date(request.billingStartDate)
          : null;
        const websiteBuildingWindowOpen =
          !billingStartDate ||
          Number.isNaN(billingStartDate.getTime()) ||
          new Date() < billingStartDate;
        const showWebsiteBuildingOption = isLive && websiteBuildingWindowOpen;
        const billingDaysRemaining = getDaysRemaining(request.billingEndDate);
        const isBillingExpired =
          billingDaysRemaining !== null && billingDaysRemaining <= 0;
        const showBillingBadge = billingDaysRemaining !== null;
        const requestInvoices = invoicesByRequest[request.id] || [];
        const invoiceStats = invoiceStatsByRequest[request.id] || {
          hasUnpaidInvoice: false,
          currentCycleUnpaidInvoice: null,
        };
        const isPaused = !!request.isPaused;

        return (
          <div
            key={request.id || index}
            id={request.id ? `service-request-${request.id}` : undefined}
            className={`request-card ${isOverdue ? "card-overdue" : ""}`}
            style={
              focusedCardId === request.id
                ? {
                    boxShadow:
                      "0 0 0 2px #f59e0b, 0 0 0 6px rgba(245, 158, 11, 0.18)",
                  }
                : undefined
            }
          >
            <div className="card-header">
              <h3>{request.name}</h3>

              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {request.lifecyclePhase && (
                  <span className={`lifecycle-badge lifecycle-${request.lifecyclePhase}`}>
                    {LIFECYCLE_PHASES.find(p => p.value === request.lifecyclePhase)?.label || request.lifecyclePhase}
                  </span>
                )}
                {request.websiteStatus && (
                  <span className={`website-badge website-${request.websiteStatus}`}>
                    {WEBSITE_STATUSES.find(w => w.value === request.websiteStatus)?.label || request.websiteStatus}
                  </span>
                )}
                {request.paymentStatus && (
                  <span className={`payment-badge payment-${request.paymentStatus}`}>
                    {PAYMENT_STATUSES.find(p => p.value === request.paymentStatus)?.label || request.paymentStatus}
                  </span>
                )}
                {isPaused && (
                  <span className="badge lifecycle-paused">PAUSED</span>
                )}
                {showBillingBadge && (
                  <span
                    className="badge"
                    style={{
                      background: isBillingExpired
                        ? "#7f1d1d"
                        : "rgba(245, 158, 11, 0.22)",
                      border: `1px solid ${isBillingExpired ? "#ef4444" : "#f59e0b"}`,
                      color: isBillingExpired ? "#fecaca" : "#fde68a",
                    }}
                  >
                    {isBillingExpired
                      ? "Expired"
                      : `Expiring in ${billingDaysRemaining} days`}
                  </span>
                )}
                <span className={`badge ${srcClass}`}>{src}</span>

                <div className="menu-container">
                  <span className="menu-icon" onClick={(e) => toggleMenu(index, e)}>&#x22EE;</span>
                  {menuOpen === index && menuPos && (
                    <div className="menu-dropdown" style={{ top: menuPos.top, left: menuPos.left, maxHeight: `min(500px, ${window.innerHeight - menuPos.top - 8}px)` }}>
                      <div className="menu-section-label">Project</div>
                      <span className="menu-item" onClick={() => handleEditRequest(request)}>View / Edit Details</span>
                      <span className="menu-item" onClick={() => handleUpdatePlan(request)}>Update Plan</span>
                      {!isLive && !isBillingExpired && (
                        <span className="menu-item success" onClick={() => handleMakeLive(request)}>Go Live</span>
                      )}
                      <hr className="menu-divider" />
                      <div className="menu-section-label">Status</div>
                      <span className="menu-item" onClick={() => updateStatus(request.id, "Negotiating")}>Negotiating</span>
                      <span className="menu-item" onClick={() => updateStatus(request.id, "Building")}>Building</span>
                      <span className="menu-item" onClick={() => updateStatus(request.id, "In Review")}>In Review</span>
                      <hr className="menu-divider" />
                      <div className="menu-section-label">Website</div>
                      <span className="menu-item" onClick={() => handlePauseWebsite(request, !isPaused)}
                        style={{ color: isPaused ? "#22c55e" : "#f59e0b" }}>
                        {isPaused ? "Resume Website" : "Pause Website"}
                      </span>
                      <hr className="menu-divider" />
                      <div className="menu-section-label">Billing</div>
                      <span className="menu-item warning" onClick={() => handleOpenCreditModal(request)}>Manage Credits</span>
                      <span className="menu-item" onClick={() => handleClearPlan(request)}>Clear Plan Details</span>
                      {request.requesterStatus && String(request.requesterStatus).toLowerCase() === "active" && (
                        <span className="menu-item danger" onClick={() => handleRemoveUser(request)}>Remove User</span>
                      )}
                      <hr className="menu-divider" />
                      <span className="menu-item danger" onClick={() => onDelete(request.id)}>Delete Request</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p>
              <strong>Email:</strong>{" "}
              <span className="value">{request.email}</span>
            </p>
            <p>
              <strong>Preferred Contact:</strong>{" "}
              <span className="value">{request.preferredContact}</span>
            </p>
            {request.otherContacts && (
              <p>
                <strong>Other Contacts:</strong>{" "}
                <span className="value">{request.otherContacts}</span>
              </p>
            )}
            <p>
              <strong>Plan:</strong>{" "}
              <span className="value">{request.plan}</span>
            </p>
            {request.plan === "Custom Plan" && (
              <>
                {request.customMonthlyPrice ? (
                  <p>
                    <strong>Monthly Price:</strong>{" "}
                    <span className="value">{formatCurrency(request.customMonthlyPrice)}</span>
                  </p>
                ) : null}
                {request.buildCost ? (
                  <p>
                    <strong>Build Cost:</strong>{" "}
                    <span className="value">{formatCurrency(request.buildCost)}</span>
                  </p>
                ) : null}
                <div
                  style={{
                    marginTop: 6,
                    padding: "8px 12px",
                    borderRadius: 6,
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    color: "#fecaca",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Please pay the fee to activate your custom plan.
                </div>
              </>
            )}
            <p>
              <strong>Billing Cycle:</strong>{" "}
              <span className="value">
                {request.billingCycle || "Standard"}
              </span>
            </p>
            <p>
              <strong>Billing Start:</strong>{" "}
              <span className="value">
                {includesWebsiteBuilding
                  ? formatDateTime(request.billingStartDate) ||
                    formatDateTime(
                      addOneMonth(getRequestBaseDate(request)).toISOString(),
                    )
                  : "Immediate"}
              </span>
            </p>
            <p>
              <strong>Billing End:</strong>{" "}
              <span className="value">
                {formatDateTime(request.billingEndDate) || "—"}
              </span>
            </p>

            <div
              style={{
                margin: "14px 0",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid rgba(96, 165, 250, 0.25)",
                background: "rgba(37, 99, 235, 0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <h4 style={{ margin: 0, color: "#bfdbfe" }}>Invoices</h4>
                <button
                  onClick={() => generateInvoiceForRequest(request)}
                  style={{ padding: "8px 14px" }}
                  disabled={!!invoiceStats.currentCycleUnpaidInvoice}
                  title={
                    invoiceStats.currentCycleUnpaidInvoice
                      ? "An unpaid invoice already exists for this billing cycle."
                      : undefined
                  }
                >
                  Generate Invoice
                </button>
              </div>

              {invoiceStats.currentCycleUnpaidInvoice && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    color: "#fecaca",
                    fontWeight: 600,
                  }}
                >
                  Unpaid invoice exists for this billing cycle:{" "}
                  {invoiceStats.currentCycleUnpaidInvoice.invoiceId ||
                    "Pending invoice"}
                  .
                </div>
              )}

              {requestInvoices.length === 0 ? (
                <p style={{ margin: 0, color: "#cbd5e1" }}>
                  No invoices yet for this request.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {requestInvoices.map((invoice) => {
                    const invoicePaid =
                      String(invoice.status || "unpaid").toLowerCase() ===
                      "paid";
                    return (
                      <div
                        key={invoice.id}
                        style={{
                          position: "relative",
                          padding: 12,
                          borderRadius: 8,
                          background: "rgba(15, 23, 42, 0.65)",
                          border: `1px solid ${invoicePaid ? "rgba(34,197,94,0.45)" : "rgba(249,115,22,0.45)"}`,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{ position: "absolute", top: 10, right: 10 }}
                        >
                          <span
                            className="badge"
                            style={{
                              background: invoicePaid
                                ? "rgba(34, 197, 94, 0.18)"
                                : "rgba(249, 115, 22, 0.18)",
                              color: invoicePaid ? "#bbf7d0" : "#fed7aa",
                              border: `1px solid ${invoicePaid ? "#22c55e" : "#f97316"}`,
                              fontWeight: 800,
                              letterSpacing: "0.04em",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span aria-hidden="true">
                              {invoicePaid ? "✓" : "!"}
                            </span>
                            {invoicePaid ? "PAID" : "UNPAID"}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                            marginBottom: 8,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, color: "#fff" }}>
                              {invoice.invoiceId}
                            </div>
                            <div
                              style={{ color: "#cbd5e1", fontSize: "0.92rem" }}
                            >
                              {invoice.planName || "—"}
                            </div>
                            <div
                              style={{ color: "#cbd5e1", fontSize: "0.92rem" }}
                            >
                              {formatCurrency(invoice.amount)}
                            </div>
                            <div
                              style={{ color: "#cbd5e1", fontSize: "0.92rem" }}
                            >
                              Billing:{" "}
                              {formatDateOnly(invoice.billingStartDate) || "—"}{" "}
                              to {formatDateOnly(invoice.billingEndDate) || "—"}
                            </div>
                            {invoice.clientOrganization && <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: 4 }}>{invoice.clientOrganization}</div>}
                            {invoice.clientEmail && <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{invoice.clientEmail}</div>}
                            {invoicePaid && invoice.paymentMethod && (
                              <div style={{ color: "#86efac", fontSize: "0.82rem", marginTop: 4 }}>
                                Paid via {invoice.paymentMethod}{invoice.transactionReference ? ` (${invoice.transactionReference})` : ""}
                              </div>
                            )}
                          </div>
                        </div>

                        <div
                          style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                        >
                          <button
                            type="button"
                            onClick={() => openInvoiceModal(invoice, "edit")}
                          >
                            Edit
                          </button>
                          {!invoicePaid ? (
                            <button
                              type="button"
                              onClick={() =>
                                openInvoiceModal(invoice, "markPaid")
                              }
                            >
                              Mark as Paid
                            </button>
                          ) : (
                            <span
                              style={{
                                color: "#22c55e",
                                fontWeight: 700,
                                alignSelf: "center",
                              }}
                            >
                              Already Paid
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleViewRequest(invoice.requestId)}
                          >
                            View Request
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadInvoice(invoice)}
                          >
                            Download Invoice
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                invoice.invoiceId || "",
                                "Invoice ID copied",
                              )
                            }
                          >
                            Copy Invoice ID
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyInvoiceMessage(invoice)}
                          >
                            Copy Client Message
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyShortInvoiceMessage(invoice)
                            }
                          >
                            Copy Short Message
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInvoice(invoice)}
                            style={{
                              backgroundColor: "#7f1d1d",
                              border: "1px solid #ef4444",
                              color: "#fff",
                            }}
                          >
                            Delete Invoice
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {showWebsiteBuildingOption && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  margin: "8px 0 12px",
                  color: "#f5d0fe",
                  fontWeight: "bold",
                }}
              >
                <input
                  type="checkbox"
                  checked={includesWebsiteBuilding}
                  disabled={websiteBuildingSaving[request.id]}
                  onChange={(e) =>
                    handleWebsiteBuildingToggle(request, e.target.checked)
                  }
                  style={{ width: 16, height: 16 }}
                />
                Includes Website Building
              </label>
            )}

            {showWebsiteBuildingOption && includesWebsiteBuilding && (() => {
              const bc = String(request.billingCycle || "").toLowerCase();
              const period = bc.includes("year") ? "Year" : bc.includes("quarter") ? "Quarter" : "Month";
              return (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    marginBottom: "10px",
                    color: "#d1fae5",
                    fontWeight: 600,
                  }}
                >
                  First {period} Free*
                  <div style={{ fontSize: "0.72rem", fontWeight: 400, color: "#a7f3d0", marginTop: 2 }}>
                    *only if we build your site from scratch
                  </div>
                </div>
              );
            })()}

            {request.plan &&
              TIER_LIMITS[request.plan] &&
              (() => {
                const credits = requestCredits[request.id] || {
                  largeCommits: 0,
                  smallChanges: 0,
                };
                const limits = TIER_LIMITS[request.plan];
                return (
                  <div
                    style={{
                      padding: "10px",
                      backgroundColor: "rgba(251, 191, 36, 0.1)",
                      borderRadius: "4px",
                      marginBottom: "8px",
                    }}
                  >
                    <p style={{ margin: "4px 0" }}>
                      <strong>Credits Used:</strong>{" "}
                      <span className="value">
                        Large: {credits.largeCommits}/{limits.largeCommits} |
                        Small: {credits.smallChanges}/
                        {limits.smallChanges === null
                          ? "∞"
                          : limits.smallChanges}
                      </span>
                    </p>
                  </div>
                );
              })()}

            <p>
              <strong>Project Reference:</strong>{" "}
              <span className="value">{request.projectReference}</span>
            </p>
            <p>
              <strong>Requirements:</strong>{" "}
              <span className="value">{request.requirements}</span>
            </p>

            <div style={{ margin: "12px 0 6px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontWeight: "bold",
                  color: "#f5d0fe",
                }}
              >
                Admin Notes{" "}
                <span style={{ fontWeight: 400, color: "#c4b5fd" }}>
                  (private)
                </span>
              </label>
              <textarea
                value={notesDrafts[request.id] ?? String(request.notes || "")}
                onChange={(e) => handleNotesChange(request.id, e.target.value)}
                placeholder="Add internal notes for this request. Visible only in the admin dashboard."
                rows={5}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  resize: "vertical",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(167, 139, 250, 0.35)",
                  background: "rgba(17, 24, 39, 0.85)",
                  color: "#fff",
                  font: "inherit",
                  lineHeight: 1.5,
                  marginBottom: "8px",
                }}
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "10px",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ color: "#c4b5fd", fontSize: "0.9rem" }}>
                  {request.notesUpdatedAt
                    ? `Last updated ${new Date(request.notesUpdatedAt).toLocaleString()}`
                    : "No saved notes yet."}
                </div>
                <button
                  onClick={() => handleSaveNotes(request)}
                  disabled={
                    notesSaving[request.id] ||
                    String(notesDrafts[request.id] ?? request.notes ?? "") ===
                      String(request.notes ?? "")
                  }
                  style={{
                    padding: "8px 14px",
                    backgroundColor: notesSaving[request.id]
                      ? "#4b5563"
                      : "#6b21a8",
                    border: "none",
                    borderRadius: "6px",
                    color: "#fff",
                    cursor: notesSaving[request.id] ? "not-allowed" : "pointer",
                    opacity: notesSaving[request.id] ? 0.7 : 1,
                  }}
                >
                  {notesSaving[request.id] ? "Saving..." : "Save Notes"}
                </button>
              </div>
            </div>
            <p>
              <strong>Status:</strong>{" "}
              <span
                className="value"
                style={{
                  color: isOverdue ? "#ff4d4d" : "#a78bfa",
                  fontWeight: "bold",
                }}
              >
                {request.requesterStatus || "Lead"}
              </span>
            </p>

            {request.renewalDate && (
              <p>
                <strong>Next Renewal:</strong>{" "}
                <span
                  className="value"
                  style={{ color: isOverdue ? "#ff4d4d" : "#10b981" }}
                >
                  {new Date(request.renewalDate).toLocaleDateString()}
                </span>
              </p>
            )}

            <p>
              <strong>Date:</strong>{" "}
              <span className="value">{request.date}</span>
            </p>
            <p>
              <strong>Source:</strong>{" "}
              <span className="value">{request.source}</span>
            </p>
            <p>
              <strong>Accepted Terms:</strong>{" "}
              <span className="value">
                {request.acceptedTerms ? "Yes" : "No"}
              </span>
            </p>
            <p>
              <strong>Created At:</strong>{" "}
              <span className="value">
                {request.createdAt
                  ? new Date(request.createdAt).toLocaleString()
                  : "—"}
              </span>
            </p>

            <hr
              style={{
                margin: "16px 0",
                border: "none",
                borderTop: "1px solid #6b21a8",
              }}
            />
          </div>
        );
      })}

      {/* Modal remains identical to your original code */}
      {updatePlanModal && (
        <div className="modal-overlay" onClick={cancelUpdatePlan}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Update Plan</h3>
            <p style={{ marginBottom: "16px", color: "#a78bfa" }}>
              Update the plan for <strong>{updatePlanModal.name}</strong>
            </p>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Select New Plan:
            </label>
            <div style={{ marginBottom: "20px" }}>
              <CustomDropdown
                options={[
                  { value: "", label: "Select a Plan" },
                  { value: "Starter Plan", label: "Starter Plan" },
                  { value: "Premium Plan", label: "Premium Plan" },
                  { value: "Elite Plan", label: "Elite Plan" },
                  { value: "To be discussed", label: "To be discussed" },
                ]}
                selected={newPlan}
                onChange={(value) => setNewPlan(value)}
                placeholder="Select a Plan"
              />
            </div>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={cancelUpdatePlan}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "transparent",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "6px",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmUpdatePlan}
                disabled={!newPlan}
                style={{
                  padding: "10px 20px",
                  backgroundColor: newPlan ? "#6b21a8" : "#333",
                  border: "none",
                  borderRadius: "6px",
                  color: "#fff",
                  cursor: newPlan ? "pointer" : "not-allowed",
                  opacity: newPlan ? 1 : 0.5,
                }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceModal.open && invoiceModal.draft && (
        <div className="modal-overlay" onClick={closeInvoiceModal}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "86vh", overflowY: "auto" }}
          >
            <h3>
              {invoiceModal.mode === "generate"
                ? "Generate Invoice"
                : invoiceModal.mode === "markPaid"
                  ? "Mark Invoice as Paid"
                  : "Edit Invoice"}
            </h3>
            <div style={{ display: "grid", gap: 12 }}>
              {invoiceModal.mode === "generate" && (
                <p style={{ margin: 0, color: "#cbd5e1" }}>
                  Review the prefilled amount and dates before saving the
                  invoice.
                </p>
              )}
              <label>
                Client Name
                <input
                  value={invoiceModal.draft.clientName}
                  onChange={(e) =>
                    updateInvoiceDraft("clientName", e.target.value)
                  }
                />
              </label>
              <label>
                Client Email
                <input
                  value={invoiceModal.draft.clientEmail}
                  onChange={(e) =>
                    updateInvoiceDraft("clientEmail", e.target.value)
                  }
                />
              </label>
              <label>
                Client Phone
                <input
                  value={invoiceModal.draft.clientPhone}
                  onChange={(e) =>
                    updateInvoiceDraft("clientPhone", e.target.value)
                  }
                />
              </label>
              <label>
                Client Organization
                <input
                  value={invoiceModal.draft.clientOrganization}
                  onChange={(e) =>
                    updateInvoiceDraft("clientOrganization", e.target.value)
                  }
                />
              </label>
              <label>
                Project Name
                <input
                  value={invoiceModal.draft.projectName}
                  onChange={(e) =>
                    updateInvoiceDraft("projectName", e.target.value)
                  }
                />
              </label>
              <label>
                Invoice ID
                <input
                  value={invoiceModal.invoiceId || "Will be generated on save"}
                  disabled
                />
              </label>
              <label>
                Plan Name
                <input
                  value={invoiceModal.draft.planName}
                  onChange={(e) =>
                    updateInvoiceDraft("planName", e.target.value)
                  }
                />
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min="0"
                  value={invoiceModal.draft.amount}
                  onChange={(e) => updateInvoiceDraft("amount", e.target.value)}
                />
              </label>
              <label>
                Billing Start Date
                <input
                  type="date"
                  value={invoiceModal.draft.billingStartDate}
                  onChange={(e) =>
                    updateInvoiceDraft("billingStartDate", e.target.value)
                  }
                />
              </label>
              <label>
                Billing End Date
                <input
                  type="date"
                  value={invoiceModal.draft.billingEndDate}
                  onChange={(e) =>
                    updateInvoiceDraft("billingEndDate", e.target.value)
                  }
                />
              </label>
              <label>
                Status
                <select
                  value={invoiceModal.draft.status}
                  onChange={(e) => updateInvoiceDraft("status", e.target.value)}
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              <label>
                Payment Method
                <select
                  value={invoiceModal.draft.paymentMethod}
                  onChange={(e) =>
                    updateInvoiceDraft("paymentMethod", e.target.value)
                  }
                >
                  <option value="">Select payment method</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                </select>
              </label>
              <label>
                Transaction Reference
                <input
                  value={invoiceModal.draft.transactionReference}
                  onChange={(e) =>
                    updateInvoiceDraft("transactionReference", e.target.value)
                  }
                  placeholder="Optional"
                />
              </label>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
                marginTop: "20px",
              }}
            >
              <button
                onClick={closeInvoiceModal}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "transparent",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "6px",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveInvoiceModal}
                disabled={invoiceModal.saving}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#2563eb",
                  border: "none",
                  borderRadius: "6px",
                  color: "#fff",
                  cursor: invoiceModal.saving ? "not-allowed" : "pointer",
                  opacity: invoiceModal.saving ? 0.7 : 1,
                }}
              >
                {invoiceModal.saving
                  ? "Saving..."
                  : invoiceModal.mode === "markPaid"
                    ? "Save Payment"
                    : "Save Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Management Modal */}
      {creditModal && (
        <div className="modal-overlay" onClick={closeCreditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Manage Credits</h3>
            <p style={{ marginBottom: "16px", color: "#a78bfa" }}>
              Managing credits for <strong>{creditModal.name}</strong> (
              {creditModal.plan})
            </p>

            {(() => {
              const plan = creditModal.plan;
              const limits = TIER_LIMITS[plan];
              const credits = requestCredits[creditModal.id] || {
                largeCommits: 0,
                smallChanges: 0,
              };

              if (!limits) {
                return (
                  <p style={{ color: "#ef4444" }}>
                    Plan not found. Please update plan first.
                  </p>
                );
              }

              const largeCommitLimit = limits.largeCommits;
              const smallChangeLimit = limits.smallChanges;
              const largeCommitRemaining =
                largeCommitLimit - credits.largeCommits;
              const smallChangeRemaining =
                smallChangeLimit === null
                  ? Infinity
                  : smallChangeLimit - credits.smallChanges;
              const canAddLargeCommit = largeCommitRemaining > 0;
              const canAddSmallChange =
                smallChangeLimit === null || smallChangeRemaining > 0;

              return (
                <div>
                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ marginBottom: "12px", color: "#fbbf24" }}>
                      Large Commits
                    </h4>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px",
                        backgroundColor: "rgba(59, 130, 246, 0.1)",
                        borderRadius: "6px",
                        marginBottom: "12px",
                      }}
                    >
                      <span>
                        <strong>
                          {credits.largeCommits}/{largeCommitLimit}
                        </strong>
                        {largeCommitRemaining <= 0 && (
                          <span style={{ color: "#ef4444", marginLeft: "8px" }}>
                            (Limit reached)
                          </span>
                        )}
                      </span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => removeCredit("largeCommit")}
                          disabled={credits.largeCommits <= 0}
                          aria-label="Remove Large Commit credit"
                          style={{
                            padding: "6px 10px",
                            backgroundColor:
                              credits.largeCommits > 0 ? "#ef4444" : "#666",
                            border: "none",
                            borderRadius: "4px",
                            color: "#fff",
                            cursor:
                              credits.largeCommits > 0
                                ? "pointer"
                                : "not-allowed",
                            opacity: credits.largeCommits > 0 ? 1 : 0.5,
                          }}
                        >
                          −
                        </button>

                        <button
                          onClick={() => addCredit("largeCommit")}
                          disabled={!canAddLargeCommit}
                          aria-label="Add Large Commit credit"
                          style={{
                            padding: "8px 16px",
                            backgroundColor: canAddLargeCommit
                              ? "#3b82f6"
                              : "#666",
                            border: "none",
                            borderRadius: "4px",
                            color: "#fff",
                            cursor: canAddLargeCommit
                              ? "pointer"
                              : "not-allowed",
                            opacity: canAddLargeCommit ? 1 : 0.5,
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ marginBottom: "12px", color: "#fbbf24" }}>
                      Small Changes
                    </h4>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px",
                        backgroundColor: "rgba(59, 130, 246, 0.1)",
                        borderRadius: "6px",
                        marginBottom: "12px",
                      }}
                    >
                      <span>
                        <strong>
                          {credits.smallChanges}/
                          {smallChangeLimit === null ? "∞" : smallChangeLimit}
                        </strong>
                        {smallChangeLimit !== null &&
                          smallChangeRemaining <= 0 && (
                            <span
                              style={{ color: "#ef4444", marginLeft: "8px" }}
                            >
                              (Limit reached)
                            </span>
                          )}
                      </span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => removeCredit("smallChange")}
                          disabled={credits.smallChanges <= 0}
                          aria-label="Remove Small Change credit"
                          style={{
                            padding: "6px 10px",
                            backgroundColor:
                              credits.smallChanges > 0 ? "#ef4444" : "#666",
                            border: "none",
                            borderRadius: "4px",
                            color: "#fff",
                            cursor:
                              credits.smallChanges > 0
                                ? "pointer"
                                : "not-allowed",
                            opacity: credits.smallChanges > 0 ? 1 : 0.5,
                          }}
                        >
                          −
                        </button>

                        <button
                          onClick={() => addCredit("smallChange")}
                          disabled={!canAddSmallChange}
                          aria-label="Add Small Change credit"
                          style={{
                            padding: "8px 16px",
                            backgroundColor: canAddSmallChange
                              ? "#3b82f6"
                              : "#666",
                            border: "none",
                            borderRadius: "4px",
                            color: "#fff",
                            cursor: canAddSmallChange
                              ? "pointer"
                              : "not-allowed",
                            opacity: canAddSmallChange ? 1 : 0.5,
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "rgba(168, 85, 247, 0.1)",
                      borderRadius: "6px",
                      marginBottom: "20px",
                    }}
                  >
                    <p style={{ margin: "4px 0", fontSize: "0.9rem" }}>
                      <strong>Plan Summary:</strong>
                    </p>
                    <p style={{ margin: "4px 0", fontSize: "0.9rem" }}>
                      • Large Commits: {largeCommitLimit}/month
                    </p>
                    <p style={{ margin: "4px 0", fontSize: "0.9rem" }}>
                      • Small Changes:{" "}
                      {smallChangeLimit === null
                        ? "Unlimited"
                        : smallChangeLimit}
                      /month
                    </p>
                  </div>
                </div>
              );
            })()}

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={closeCreditModal}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "transparent",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "6px",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Custom Request Modal */}
      {customModal.open && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!customModal.saving) setCustomModal({ open: false, saving: false });
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: 520, width: "100%", maxHeight: "86vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", color: "#fbbf24" }}>Create Custom Request</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                className="search-input"
                placeholder="Client Name *"
                value={customForm.name}
                onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                style={{ width: "100%" }}
              />
              <input
                className="search-input"
                placeholder="Email *"
                value={customForm.email}
                onChange={(e) => setCustomForm({ ...customForm, email: e.target.value })}
                style={{ width: "100%" }}
              />
              <input
                className="search-input"
                placeholder="Preferred Contact"
                value={customForm.preferredContact}
                onChange={(e) => setCustomForm({ ...customForm, preferredContact: e.target.value })}
                style={{ width: "100%" }}
              />
              <input
                className="search-input"
                placeholder="Other Contacts"
                value={customForm.otherContacts}
                onChange={(e) => setCustomForm({ ...customForm, otherContacts: e.target.value })}
                style={{ width: "100%" }}
              />

              <select
                className="search-input"
                value={customForm.plan}
                onChange={(e) => setCustomForm({ ...customForm, plan: e.target.value })}
                style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}
              >
                <option value="To be discussed">To be discussed</option>
                <option value="Starter Plan">Starter Plan</option>
                <option value="Premium Plan">Premium Plan</option>
                <option value="Elite Plan">Elite Plan</option>
                <option value="Custom Plan">Custom Plan</option>
              </select>

              <select
                className="search-input"
                value={customForm.billingCycle}
                onChange={(e) => {
                  const cycle = e.target.value;
                  let end = customForm.billingStartDate;
                  if (end) {
                    const endDate = new Date(end + "T00:00:00");
                    if (cycle === "Monthly") endDate.setMonth(endDate.getMonth() + 1);
                    else if (cycle === "Quarterly") endDate.setMonth(endDate.getMonth() + 3);
                    else if (cycle === "Yearly") endDate.setFullYear(endDate.getFullYear() + 1);
                    end = endDate.toISOString().slice(0, 10);
                  }
                  setCustomForm({ ...customForm, billingCycle: cycle, billingEndDate: end });
                }}
                style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}
              >
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Yearly">Yearly</option>
              </select>

              {customForm.plan === "Custom Plan" && (
                <>
                  <input
                    className="search-input"
                    placeholder="Custom Monthly Price (INR)"
                    type="number"
                    value={customForm.customMonthlyPrice}
                    onChange={(e) => setCustomForm({ ...customForm, customMonthlyPrice: e.target.value })}
                    style={{ width: "100%" }}
                  />
                  <input
                    className="search-input"
                    placeholder="Build Cost (INR)"
                    type="number"
                    value={customForm.buildCost}
                    onChange={(e) => setCustomForm({ ...customForm, buildCost: e.target.value })}
                    style={{ width: "100%" }}
                  />
                </>
              )}

              <input
                className="search-input"
                placeholder="Billing Start Date"
                type="date"
                value={customForm.billingStartDate}
                onChange={(e) => {
                  const start = e.target.value;
                  let end = "";
                  if (start) {
                    const startDate = new Date(start + "T00:00:00");
                    const endDate = new Date(startDate);
                    if (customForm.billingCycle === "Monthly") endDate.setMonth(endDate.getMonth() + 1);
                    else if (customForm.billingCycle === "Quarterly") endDate.setMonth(endDate.getMonth() + 3);
                    else if (customForm.billingCycle === "Yearly") endDate.setFullYear(endDate.getFullYear() + 1);
                    end = endDate.toISOString().slice(0, 10);
                  }
                  setCustomForm({ ...customForm, billingStartDate: start, billingEndDate: end });
                }}
                style={{ width: "100%" }}
              />
              <input
                className="search-input"
                placeholder="Billing End Date"
                type="date"
                value={customForm.billingEndDate}
                onChange={(e) => setCustomForm({ ...customForm, billingEndDate: e.target.value })}
                style={{ width: "100%" }}
              />

              <input
                className="search-input"
                placeholder="Project Reference"
                value={customForm.projectReference}
                onChange={(e) => setCustomForm({ ...customForm, projectReference: e.target.value })}
                style={{ width: "100%" }}
              />

              <textarea
                className="search-input"
                placeholder="Requirements / Custom notes..."
                value={customForm.requirements}
                onChange={(e) => setCustomForm({ ...customForm, requirements: e.target.value })}
                rows={3}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "flex-end",
                marginTop: 20,
              }}
            >
              <button
                onClick={() => setCustomModal({ open: false, saving: false })}
                disabled={customModal.saving}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 6,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!customForm.name.trim() || !customForm.email.trim()) return;
                  setCustomModal((p) => ({ ...p, saving: true }));
                  try {
                    const now = new Date().toISOString();
                    await addDoc(collection(db, "serviceRequests"), {
                      ...customForm,
                      name: customForm.name.trim(),
                      email: customForm.email.trim(),
                      customMonthlyPrice: customForm.customMonthlyPrice ? Number(customForm.customMonthlyPrice) : "",
                      buildCost: customForm.buildCost ? Number(customForm.buildCost) : "",
                      status: "active",
                      requesterStatus: "Lead",
                      date: now,
                      createdAt: now,
                      billingStartDate: customForm.billingStartDate
                        ? new Date(customForm.billingStartDate).toISOString()
                        : "",
                      billingEndDate: customForm.billingEndDate
                        ? new Date(customForm.billingEndDate).toISOString()
                        : "",
                      liveDate: "",
                      renewalDate: "",
                      isPaused: false,
                      credits: { largeCommits: 0, smallChanges: 0, lastResetMonth: now.slice(0, 7) },
                      notes: "",
                      includesWebsiteBuilding: false,
                    });
                    setCustomModal({ open: false, saving: false });
                  } catch (e) {
                    console.error("Failed to create custom request:", e);
                    setCustomModal((p) => ({ ...p, saving: false }));
                  }
                }}
                disabled={customModal.saving || !customForm.name.trim() || !customForm.email.trim()}
                style={{
                  padding: "10px 20px",
                  background:
                    customModal.saving || !customForm.name.trim() || !customForm.email.trim()
                      ? "rgba(255,255,255,0.1)"
                      : "linear-gradient(135deg, #7c3aed, #a78bfa)",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  cursor:
                    customModal.saving || !customForm.name.trim() || !customForm.email.trim()
                      ? "not-allowed"
                      : "pointer",
                  fontWeight: 600,
                }}
              >
                {customModal.saving ? "Creating..." : "Create Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Request Modal */}
      {editModal.open && (
        <div
          className="modal-overlay"
          onClick={() => { if (!editModal.saving) setEditModal({ open: false, saving: false, request: null }); }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: 520, width: "100%", maxHeight: "86vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", color: "#fbbf24" }}>Edit Request</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input className="search-input" placeholder="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Preferred Contact" value={editForm.preferredContact} onChange={(e) => setEditForm({ ...editForm, preferredContact: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Other Contacts" value={editForm.otherContacts} onChange={(e) => setEditForm({ ...editForm, otherContacts: e.target.value })} style={{ width: "100%" }} />

              <select className="search-input" value={editForm.plan} onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="To be discussed">To be discussed</option>
                <option value="Starter Plan">Starter Plan</option>
                <option value="Premium Plan">Premium Plan</option>
                <option value="Elite Plan">Elite Plan</option>
                <option value="Custom Plan">Custom Plan</option>
              </select>

              <select className="search-input" value={editForm.billingCycle} onChange={(e) => setEditForm({ ...editForm, billingCycle: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Yearly">Yearly</option>
              </select>

              <input className="search-input" placeholder="Billing Start Date" type="date" value={editForm.billingStartDate} onChange={(e) => setEditForm({ ...editForm, billingStartDate: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Billing End Date" type="date" value={editForm.billingEndDate} onChange={(e) => setEditForm({ ...editForm, billingEndDate: e.target.value })} style={{ width: "100%" }} />

              <input className="search-input" placeholder="Project Reference" value={editForm.projectReference} onChange={(e) => setEditForm({ ...editForm, projectReference: e.target.value })} style={{ width: "100%" }} />

              <input className="search-input" placeholder="Source" value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Custom Monthly Price" value={editForm.customMonthlyPrice} onChange={(e) => setEditForm({ ...editForm, customMonthlyPrice: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Build Cost" value={editForm.buildCost} onChange={(e) => setEditForm({ ...editForm, buildCost: e.target.value })} style={{ width: "100%" }} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#c4b5fd", fontSize: "0.9rem" }}>
                <input type="checkbox" checked={editForm.acceptedTerms} onChange={(e) => setEditForm({ ...editForm, acceptedTerms: e.target.checked })} style={{ width: 16, height: 16 }} />
                Accepted Terms
              </label>

              <textarea className="search-input" placeholder="Requirements" value={editForm.requirements} onChange={(e) => setEditForm({ ...editForm, requirements: e.target.value })} rows={3} style={{ width: "100%", resize: "vertical" }} />
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                onClick={() => setEditModal({ open: false, saving: false, request: null })}
                disabled={editModal.saving}
                style={{ padding: "10px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#fff", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!editModal.request?.id) return;
                  setEditModal((p) => ({ ...p, saving: true }));
                  try {
                    const updates = {
                      name: editForm.name.trim(),
                      email: editForm.email.trim(),
                      preferredContact: editForm.preferredContact,
                      otherContacts: editForm.otherContacts,
                      plan: editForm.plan,
                      billingCycle: editForm.billingCycle,
                      billingStartDate: editForm.billingStartDate ? new Date(editForm.billingStartDate).toISOString() : "",
                      billingEndDate: editForm.billingEndDate ? new Date(editForm.billingEndDate).toISOString() : "",
                      projectReference: editForm.projectReference,
                      source: editForm.source,
                      customMonthlyPrice: editForm.customMonthlyPrice,
                      buildCost: editForm.buildCost,
                      acceptedTerms: editForm.acceptedTerms,
                      requirements: editForm.requirements,
                    };
                    await updateDoc(doc(db, "serviceRequests", editModal.request.id), updates);
                    setEditModal({ open: false, saving: false, request: null });
                  } catch (e) {
                    console.error("Failed to update request:", e);
                    setEditModal((p) => ({ ...p, saving: false }));
                  }
                }}
                disabled={editModal.saving || !editForm.name.trim() || !editForm.email.trim()}
                style={{
                  padding: "10px 20px",
                  background: editModal.saving || !editForm.name.trim() || !editForm.email.trim() ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #7c3aed, #a78bfa)",
                  border: "none", borderRadius: 6, color: "#fff",
                  cursor: editModal.saving || !editForm.name.trim() || !editForm.email.trim() ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {editModal.saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Confirm / Info modal */}
      <ConfirmModal
        open={!!confirmModal.open}
        title={confirmModal.title || ""}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
        confirmLabel={confirmModal.confirmLabel}
        cancelLabel={confirmModal.cancelLabel}
        destructive={confirmModal.destructive}
      >
        {confirmModal.message}
      </ConfirmModal>
    </div>
  );
};

export default ServiceRequestsTab;
