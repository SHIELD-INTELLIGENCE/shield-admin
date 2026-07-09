import React, { useState, useMemo, useEffect, useRef } from "react";
import "../global.css";
import CustomDropdown from "../components/CustomDropdown.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { jsPDF } from "jspdf";
import { doc, updateDoc, deleteDoc, runTransaction, addDoc, collection, arrayUnion } from "firebase/firestore";
import { db, invoicesCollection } from "../firebase.js";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in-review", label: "In Review" },
  { value: "contacted", label: "Contacted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "on-hold", label: "On Hold" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const ENTERPRISE_CREDIT_LIMITS = {
  largeCommits: 10,
  smallChanges: null,
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

const PROJECT_PHASES = [
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "planning", label: "Planning" },
  { value: "development", label: "Development" },
  { value: "testing", label: "Testing" },
  { value: "deployment", label: "Deployment" },
  { value: "go-live", label: "Go Live" },
  { value: "maintenance", label: "Maintenance" },
  { value: "completed", label: "Completed" },
];

const PAYMENT_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "suspended", label: "Suspended" },
  { value: "refunded", label: "Refunded" },
];

function formatDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-IN", {
    year: "numeric", month: "short", day: "numeric",
  }) + " " + parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function nowISO() {
  return new Date().toISOString();
}

const EnterpriseRequestsTab = ({
  data = [],
  invoicesData = [],
}) => {
  const [menuOpen, setMenuOpen] = useState(null);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("any");
  const [filterPriority, setFilterPriority] = useState("any");
  const [sortBy, setSortBy] = useState("createdDesc");
  const [expandedId, setExpandedId] = useState(null);
  const [notesDrafts, setNotesDrafts] = useState({});
  const [notesSaving, setNotesSaving] = useState({});
  const [confirmModal, setConfirmModal] = useState({ open: false });
  const [editingId, setEditingId] = useState(null);
  const [customModal, setCustomModal] = useState({ open: false, saving: false });
  const [customForm, setCustomForm] = useState({
    companyName: "",
    contactPerson: "",
    email: "",
    phone: "",
    organizationType: "",
    industry: "",
    companySize: "",
    projectTitle: "",
    projectDescription: "",
    estimatedBudget: "",
    expectedTimeline: "",
    preferredContactMethod: "",
    startDate: "",
    endDate: "",
    notes: "",
  });
  const [invoiceModal, setInvoiceModal] = useState({
    open: false,
    mode: "generate",
    draft: null,
    invoiceId: null,
    requestId: null,
    saving: false,
  });
  const [editModal, setEditModal] = useState({ open: false, saving: false, request: null });
  const [editForm, setEditForm] = useState({});
  const [filterArchived, setFilterArchived] = useState("any");
  const [filterAssigned, setFilterAssigned] = useState("any");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkActionModal, setBulkActionModal] = useState({ open: false });
  const [menuPos, setMenuPos] = useState(null);
  const [creditModal, setCreditModal] = useState({ open: false, request: null });
  const [requestCredits, setRequestCredits] = useState({ largeCommits: 0, smallChanges: 0 });

  const anyModalOpen = !!menuOpen || confirmModal.open || customModal.open || invoiceModal.open || editModal.open || bulkActionModal.open || creditModal.open;

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

  useEffect(() => {
    if (!data || !data.length) return;
    setNotesDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      data.forEach((item) => {
        if (!item?.id || prev[item.id] !== undefined) return;
        const incoming = String(item.notes || "");
        if (next[item.id] !== incoming) {
          next[item.id] = incoming;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [data]);

  // Initialize local credits map from incoming data
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
    if (!requestId || !action) return;
    try {
      const ref = doc(db, "enterpriseConsultations", requestId);
      await updateDoc(ref, {
        timeline: arrayUnion({
          timestamp: new Date().toISOString(),
          action,
          notes: notes || "",
        }),
      });
    } catch (e) {
      console.error("Failed to record enterprise timeline event:", e);
    }
  };

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
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", recalcMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", recalcMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menuOpen, menuPos]);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
    setMenuOpen(null);
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

  const updateEnterpriseDoc = async (id, updates) => {
    await updateDoc(doc(db, "enterpriseConsultations", id), updates);
  };

  const handleOpenCreditModal = (request) => {
    setCreditModal({ open: true, request });
    if (!requestCredits[request.id]) {
      setRequestCredits((prev) => ({
        ...prev,
        [request.id]: { largeCommits: 0, smallChanges: 0 },
      }));
    }
  };

  const closeCreditModal = () => {
    setCreditModal({ open: false, request: null });
  };

  const addCreditToEnterpriseRequest = async (type) => {
    const req = creditModal.request;
    if (!req) return;
    const currentCredits = requestCredits[req.id] || { largeCommits: 0, smallChanges: 0 };
    const newCredits = { ...currentCredits };
    if (type === "largeCommit" && currentCredits.largeCommits < ENTERPRISE_CREDIT_LIMITS.largeCommits) {
      newCredits.largeCommits = currentCredits.largeCommits + 1;
    } else if (type === "smallChange" && (ENTERPRISE_CREDIT_LIMITS.smallChanges === null || currentCredits.smallChanges < ENTERPRISE_CREDIT_LIMITS.smallChanges)) {
      newCredits.smallChanges = currentCredits.smallChanges + 1;
    } else return;
    const prevCredits = { ...currentCredits };
    setRequestCredits((prev) => ({ ...prev, [req.id]: newCredits }));
    try {
      await updateDoc(doc(db, "enterpriseConsultations", req.id), { credits: newCredits });
    } catch (err) {
      console.error("Failed to persist credits:", err);
      setRequestCredits((prev) => ({ ...prev, [req.id]: prevCredits }));
      showConfirm({ title: "Error", message: "Failed to update credits. Please try again.", cancelLabel: "OK" });
    }
  };

  const removeCreditFromEnterpriseRequest = async (type) => {
    const req = creditModal.request;
    if (!req) return;
    const currentCredits = requestCredits[req.id] || { largeCommits: 0, smallChanges: 0 };
    const prevCredits = { ...currentCredits };
    const newCredits = { ...currentCredits };
    if (type === "largeCommit" && currentCredits.largeCommits > 0) {
      newCredits.largeCommits = currentCredits.largeCommits - 1;
    } else if (type === "smallChange" && currentCredits.smallChanges > 0) {
      newCredits.smallChanges = currentCredits.smallChanges - 1;
    } else return;
    setRequestCredits((prev) => ({ ...prev, [req.id]: newCredits }));
    try {
      await updateDoc(doc(db, "enterpriseConsultations", req.id), { credits: newCredits });
    } catch (err) {
      console.error("Failed to persist credits removal:", err);
      setRequestCredits((prev) => ({ ...prev, [req.id]: prevCredits }));
      showConfirm({ title: "Error", message: "Failed to update credits. Please try again.", cancelLabel: "OK" });
    }
  };

  const updateStatus = async (id, newStatus) => {
    await updateEnterpriseDoc(id, {
      status: newStatus,
      updatedAt: nowISO(),
      activityLog: getUpdatedActivityLog(data.find((r) => r.id === id), `Status changed to ${newStatus}`),
    });
    closeMenu();
  };

  const updatePriority = async (id, newPriority) => {
    await updateEnterpriseDoc(id, {
      priority: newPriority,
      updatedAt: nowISO(),
      activityLog: getUpdatedActivityLog(data.find((r) => r.id === id), `Priority changed to ${newPriority}`),
    });
    closeMenu();
  };

  const getUpdatedActivityLog = (item, action) => {
    const existing = item?.activityLog || [];
    return [
      ...existing,
      {
        action,
        timestamp: nowISO(),
      },
    ];
  };

  const handleSaveNotes = async (item) => {
    if (!item?.id) return;
    const draft = String(notesDrafts[item.id] ?? item.notes ?? "");
    const persisted = String(item.notes ?? "");
    if (draft === persisted) return;

    setNotesSaving((prev) => ({ ...prev, [item.id]: true }));
    try {
      await updateDoc(doc(db, "enterpriseConsultations", item.id), {
        notes: draft,
        updatedAt: nowISO(),
      });
    } catch (err) {
      console.error("Failed to save notes:", err);
    } finally {
      setNotesSaving((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleAssign = async (item) => {
    const name = prompt("Enter team member name to assign:", item.assignedTo || "");
    if (!name || !name.trim()) return;
    await updateEnterpriseDoc(item.id, {
      assignedTo: name.trim(),
      updatedAt: nowISO(),
      activityLog: getUpdatedActivityLog(item, `Assigned to ${name.trim()}`),
    });
    closeMenu();
  };

  const handleArchive = async (item) => {
    await updateEnterpriseDoc(item.id, {
      archived: true,
      updatedAt: nowISO(),
      activityLog: getUpdatedActivityLog(item, "Request archived"),
    });
    closeMenu();
  };

  const handleRestore = async (item) => {
    await updateEnterpriseDoc(item.id, {
      archived: false,
      updatedAt: nowISO(),
      activityLog: getUpdatedActivityLog(item, "Request restored"),
    });
    closeMenu();
  };

  const handleDelete = (item) => {
    showConfirm({
      title: "Delete Enterprise Request",
      message: `Delete request from ${item.companyName || item.contactPerson || item.email || item.id}? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "enterpriseConsultations", item.id));
          closeConfirm();
        } catch (err) {
          console.error("Failed to delete:", err);
          closeConfirm();
        }
      },
    });
  };

  const flatStatusLabels = {
    pending: { label: "Pending", color: "#f59e0b" },
    "in-review": { label: "In Review", color: "#3b82f6" },
    contacted: { label: "Contacted", color: "#8b5cf6" },
    approved: { label: "Approved", color: "#22c55e" },
    rejected: { label: "Rejected", color: "#ef4444" },
    "on-hold": { label: "On Hold", color: "#f97316" },
  };

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
  let clearString = numeric.toString();
  const lastThree = clearString.substring(clearString.length - 3);
  const otherBits = clearString.substring(0, clearString.length - 3);
  if (otherBits !== '') {
    clearString = otherBits.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
  }
  return `INR ${clearString}`;
}

function getEnterpriseInvoiceDraft(request) {
  const start = request.createdAt || new Date().toISOString();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return {
    requestId: request.id,
    clientName: request.companyName || request.contactPerson || "",
    clientEmail: request.email || "",
    clientPhone: request.phone || "",
    clientOrganization: request.organizationType || "",
    clientIndustry: request.industry || "",
    projectName: request.projectTitle || "",
    projectDescription: request.projectDescription || "",
    companySize: request.companySize || "",
    planName: "Enterprise - " + (request.projectTitle || "Consultation"),
    amount: "0",
    billingStartDate: toDateInputValue(request.createdAt || new Date().toISOString()),
    billingEndDate: toDateInputValue(end.toISOString()),
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
  return String(status || "unpaid").toLowerCase() === "paid" ? "Paid" : "Unpaid";
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

async function buildEnterpriseInvoicePdf(invoice) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const m = 16;
  const cw = pw - m * 2;

  pdf.setLineHeightFactor(1.3);
  pdf.setFillColor(18, 18, 18);
  pdf.rect(0, 0, pw, ph, "F");
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

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(140, 140, 140);
  pdf.text("SHIELD Intelligence | queriesshield@gmail.com", m + 24, 29);
  pdf.text("Haldwani, Uttarakhand, India", m + 24, 33);

  pdf.setDrawColor(202, 169, 76);
  pdf.setLineWidth(0.4);
  pdf.line(m, 38, pw - m, 38);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.setTextColor(202, 169, 76);
  pdf.text("INVOICE", m, 56);

  const invoiceDateStr = invoice.createdAt || new Date().toISOString();
  const metaX = pw - m;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(160, 160, 160);
  pdf.text("Invoice ID:", metaX, 50, { align: "right" });
  pdf.setTextColor(220, 220, 220);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(invoice.invoiceId || "—", metaX, 56, { align: "right" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(160, 160, 160);
  pdf.text("Date Issued:", metaX, 64, { align: "right" });
  pdf.setTextColor(220, 220, 220);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(formatDateOnly(invoiceDateStr), metaX, 70, { align: "right" });

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
      pdf.text("Size: " + invoice.companySize, pw - m - 12, cy + 18, { align: "right" });
    }

    cy += projH + 4;
  }

  cy += 4;
  const col1X = m + 12;
  const col4X = pw - m - 12;
  const rowH = 7;

  pdf.setFillColor(40, 40, 40);
  pdf.rect(m, cy, cw, rowH + 4, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(202, 169, 76);
  pdf.text("DESCRIPTION", col1X, cy + rowH);
  pdf.text("AMOUNT", col4X, cy + rowH, { align: "right" });

  cy += rowH + 4;
  pdf.setFillColor(24, 24, 24);
  pdf.rect(m, cy, cw, rowH + 6, "F");

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(220, 220, 220);
  pdf.text(invoice.planName || "Enterprise Service", col1X, cy + rowH);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(202, 169, 76);
  pdf.text(formatCurrency(invoice.amount), col4X, cy + rowH, { align: "right" });

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

  pdf.setFillColor(202, 169, 76);
  pdf.rect(0, ph - 2, pw, 2, "F");

  pdf.save(`${invoice.invoiceId || "SHIELD-invoice"}.pdf`);
}

const BUDGET_LABELS = {
  "under-1l": "Under ₹1,00,000",
  "1l-5l": "₹1,00,000 - ₹5,00,000",
  "5l-10l": "₹5,00,000 - ₹10,00,000",
  "10l-25l": "₹10,00,000 - ₹25,00,000",
  "25l+": "₹25,00,000+",
  "not-sure": "Not sure / To be discussed",
};

const TIMELINE_LABELS = {
  urgent: "ASAP (Within 1 month)",
  short: "1-3 months",
  medium: "3-6 months",
  long: "6+ months",
  planning: "Still planning",
};

const flatPriorityLabels = {
    low: { label: "Low", color: "#6b7280" },
    medium: { label: "Medium", color: "#f59e0b" },
    high: { label: "High", color: "#ef4444" },
    critical: { label: "Critical", color: "#dc2626" },
  };

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const arr = (data || []).filter((item) => {
      if (filterStatus !== "any" && (item.status || "pending") !== filterStatus)
        return false;
      if (filterPriority !== "any" && (item.priority || "medium") !== filterPriority)
        return false;
      if (filterArchived === "archived" && !item.archived) return false;
      if (filterArchived === "active" && item.archived) return false;
      if (filterAssigned !== "any") {
        const assigned = (item.assignedTo || "").toLowerCase();
        if (filterAssigned === "unassigned" && assigned) return false;
        if (filterAssigned !== "unassigned" && assigned !== filterAssigned.toLowerCase()) return false;
      }
      if (!q) return true;
      const hay = [
        item.companyName,
        item.contactPerson,
        item.email,
        item.phone,
        item.projectTitle,
        item.projectDescription,
        item.industry,
        item.assignedTo,
        item.status,
        item.priority,
        item.organizationType,
        item.companySize,
        item.notes,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });

    if (sortBy === "createdAsc") {
      arr.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    } else if (sortBy === "createdDesc") {
      arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (sortBy === "companyAsc") {
      arr.sort((a, b) => String(a.companyName || "").localeCompare(String(b.companyName || "")));
    } else if (sortBy === "companyDesc") {
      arr.sort((a, b) => String(b.companyName || "").localeCompare(String(a.companyName || "")));
    }

    return arr;
  }, [data, query, filterStatus, filterPriority, filterArchived, filterAssigned, sortBy]);

  const invoicesByEnterpriseRequest = useMemo(() => {
    const map = {};
    (invoicesData || []).forEach((invoice) => {
      const key = invoice.requestId;
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(invoice);
    });
    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) => {
        const aTime = new Date(a.createdAt || a.billingStartDate || 0).getTime();
        const bTime = new Date(b.createdAt || b.billingStartDate || 0).getTime();
        return bTime - aTime;
      });
    });
    return map;
  }, [invoicesData]);

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
    const existing = (invoicesByEnterpriseRequest[request.id] || []).find(
      (inv) => String(inv.status || "unpaid").toLowerCase() !== "paid"
    );
    if (existing) {
      showConfirm({
        title: "Unpaid Invoice Exists",
        message: `Invoice ${existing.invoiceId || "—"} for ${existing.clientName || "this client"} is still unpaid. Generate another?`,
        onConfirm: () => {
          setInvoiceModal({
            open: true,
            mode: "generate",
            requestId: request.id,
            draft: getEnterpriseInvoiceDraft(request),
            saving: false,
          });
        },
        confirmLabel: "Generate Anyway",
        cancelLabel: "Cancel",
      });
      return;
    }
    setInvoiceModal({
      open: true,
      mode: "generate",
      requestId: request.id,
      draft: getEnterpriseInvoiceDraft(request),
      saving: false,
    });
  };

  const closeInvoiceModal = () => {
    setInvoiceModal({
      open: false,
      mode: "generate",
      draft: null,
      invoiceId: null,
      requestId: null,
      saving: false,
    });
  };

  const updateInvoiceDraft = (field, value) => {
    setInvoiceModal((prev) => ({
      ...prev,
      draft: { ...(prev.draft || {}), [field]: value },
    }));
  };

  const saveInvoiceModal = async () => {
    if (!invoiceModal.open || !invoiceModal.draft) return;
    const nextAmount = Number(invoiceModal.draft.amount || 0);
    const nextStart = parseDateInputValue(invoiceModal.draft.billingStartDate);
    const nextEnd = parseDateInputValue(invoiceModal.draft.billingEndDate);
    const nextStatus = String(invoiceModal.draft.status || "unpaid").toLowerCase() === "paid" ? "paid" : "unpaid";

    setInvoiceModal((prev) => ({ ...prev, saving: true }));
    try {
      if (invoiceModal.mode === "generate") {
        const invoiceRef = doc(invoicesCollection);
        const counterRef = doc(db, "system", "invoiceCounter");
        let createdInvoiceId = "";

        await runTransaction(db, async (transaction) => {
          const counterSnap = await transaction.get(counterRef);
          const lastNumber = counterSnap.exists() ? Number(counterSnap.data()?.lastInvoiceNumber || 0) : 0;
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
            transaction.update(counterRef, { lastInvoiceNumber: nextNumber, updatedAt: new Date().toISOString() });
          } else {
            transaction.set(counterRef, { lastInvoiceNumber: nextNumber, updatedAt: new Date().toISOString() });
          }
        });

        closeInvoiceModal();
        showConfirm({
          title: "Done",
          message: `Invoice generated${createdInvoiceId ? ` (${createdInvoiceId})` : ""}.`,
          cancelLabel: "OK",
        });
      } else {
        const invoiceRef = doc(db, "invoices", invoiceModal.invoiceId);
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
        });

        closeInvoiceModal();
        showConfirm({
          title: "Done",
          message: nextStatus === "paid" ? "Invoice marked as paid." : "Invoice updated.",
          cancelLabel: "OK",
        });
      }
    } catch (err) {
      console.error("Failed to update invoice:", err);
      showConfirm({ title: "Error", message: "Failed to update invoice. Please try again.", cancelLabel: "OK" });
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
      showConfirm({ title: "Done", message: successMessage, cancelLabel: "OK" });
    } catch (err) {
      console.error("Failed to copy text:", err);
      showConfirm({ title: "Error", message: "Failed to copy. Please try again.", cancelLabel: "OK" });
    }
  };

  const handleCopyInvoiceId = (invoice) => {
    copyToClipboard(invoice.invoiceId || "", "Invoice ID copied.");
  };

  const handleCopyInvoiceMessage = (invoice) => {
    copyToClipboard(buildInvoiceMessage(invoice), "Client message copied.");
  };

  const handleCopyShortInvoiceMessage = (invoice) => {
    copyToClipboard(buildShortInvoiceMessage(invoice), "Short message copied.");
  };

  const handleDownloadInvoice = async (invoice) => {
    if (!invoice) return;
    const invoiceForPdf = {
      ...invoice,
      createdAt: invoice.createdAt || new Date().toISOString(),
    };
    await buildEnterpriseInvoicePdf(invoiceForPdf);
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
          showConfirm({ title: "Deleted", message: "Invoice deleted.", cancelLabel: "OK" });
        } catch (err) {
          console.error("Failed to delete invoice:", err);
          closeConfirm();
          showConfirm({ title: "Error", message: "Failed to delete invoice.", cancelLabel: "OK" });
        }
      },
    });
  };

  const handleEditRequest = (item) => {
    if (!item) return;
    setEditForm({
      companyName: item.companyName || "",
      contactPerson: item.contactPerson || "",
      email: item.email || "",
      phone: item.phone || "",
      organizationType: item.organizationType || "",
      industry: item.industry || "",
      companySize: item.companySize || "",
      projectTitle: item.projectTitle || "",
      projectDescription: item.projectDescription || "",
      estimatedBudget: item.estimatedBudget || "",
      expectedTimeline: item.expectedTimeline || "",
      requiredFeatures: item.requiredFeatures || "",
      integrations: item.integrations || "",
      existingSystem: item.existingSystem || "",
      preferredContactMethod: item.preferredContactMethod || "",
    });
    setEditModal({ open: true, saving: false, request: item });
  };

  const submitEditRequest = async () => {
    if (!editModal.request?.id) return;
    setEditModal((p) => ({ ...p, saving: true }));
    try {
      await updateDoc(doc(db, "enterpriseConsultations", editModal.request.id), {
        companyName: editForm.companyName.trim(),
        contactPerson: editForm.contactPerson.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        organizationType: editForm.organizationType,
        industry: editForm.industry,
        companySize: editForm.companySize,
        projectTitle: editForm.projectTitle.trim(),
        projectDescription: editForm.projectDescription.trim(),
        estimatedBudget: editForm.estimatedBudget,
        expectedTimeline: editForm.expectedTimeline,
        requiredFeatures: editForm.requiredFeatures,
        integrations: editForm.integrations,
        existingSystem: editForm.existingSystem,
        preferredContactMethod: editForm.preferredContactMethod,
        updatedAt: nowISO(),
        activityLog: getUpdatedActivityLog(editModal.request, "Request details edited"),
      });
      setEditModal({ open: false, saving: false, request: null });
    } catch (e) {
      console.error("Failed to update enterprise request:", e);
      setEditModal((p) => ({ ...p, saving: false }));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  const getUniqueAssigned = useMemo(() => {
    const set = new Set();
    (data || []).forEach((item) => {
      if (item.assignedTo) set.add(item.assignedTo);
    });
    return Array.from(set).sort();
  }, [data]);

  const submitBulkAction = async (field, value) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const action = field === "status" ? `Status changed to ${value}` : `Priority changed to ${value}`;
    try {
      await Promise.all(
        ids.map((id) =>
          updateDoc(doc(db, "enterpriseConsultations", id), {
            [field]: value,
            updatedAt: nowISO(),
            activityLog: getUpdatedActivityLog(data.find((r) => r.id === id), action),
          })
        )
      );
      setBulkActionModal({ open: false });
      setSelectedIds(new Set());
      showConfirm({ title: "Done", message: `${ids.length} request(s) updated.`, cancelLabel: "OK" });
    } catch (err) {
      console.error("Bulk update failed:", err);
      showConfirm({ title: "Error", message: "Bulk update failed.", cancelLabel: "OK" });
    }
  };

  const submitCustomEnterpriseRequest = async () => {
    if (!customForm.companyName.trim() || !customForm.contactPerson.trim() || !customForm.email.trim()) return;
    setCustomModal((p) => ({ ...p, saving: true }));
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, "enterpriseConsultations"), {
        companyName: customForm.companyName.trim(),
        contactPerson: customForm.contactPerson.trim(),
        email: customForm.email.trim(),
        phone: customForm.phone.trim(),
        organizationType: customForm.organizationType,
        industry: customForm.industry,
        companySize: customForm.companySize,
        projectTitle: customForm.projectTitle.trim(),
        projectDescription: customForm.projectDescription.trim(),
        estimatedBudget: customForm.estimatedBudget,
        expectedTimeline: customForm.expectedTimeline,
        preferredContactMethod: customForm.preferredContactMethod,
        startDate: customForm.startDate || null,
        endDate: customForm.endDate || null,
        notes: customForm.notes,
        acceptedTerms: true,
        status: "pending",
        priority: "medium",
        assignedTo: "",
        createdAt: new Date().toISOString(),
        updatedAt: now,
        activityLog: [{ action: "Custom request created from admin panel", timestamp: now }],
      });
      setCustomModal({ open: false, saving: false });
    } catch (e) {
      console.error("Failed to create custom enterprise request:", e);
      setCustomModal((p) => ({ ...p, saving: false }));
    }
  };

  const statusCounts = useMemo(() => {
    const counts = {};
    (data || []).forEach((item) => {
      const s = item.status || "pending";
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [data]);

  return (
    <div className="enterprise-requests-tab">
      <h2>Enterprise Consultation Requests</h2>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button
          onClick={() => {
            setCustomForm({
              companyName: "",
              contactPerson: "",
              email: "",
              phone: "",
              organizationType: "",
              industry: "",
              companySize: "",
              projectTitle: "",
              projectDescription: "",
              estimatedBudget: "",
              expectedTimeline: "",
              preferredContactMethod: "",
              notes: "",
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
          + Create Custom Enterprise Request
        </button>

        {selectedIds.size > 0 && (
          <>
            <span style={{ color: "#c4b5fd", fontSize: "0.9rem" }}>{selectedIds.size} selected</span>
            <button
              onClick={() => setBulkActionModal({ open: true })}
              style={{ padding: "6px 14px", background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              Bulk Update
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{ padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
            >
              Clear Selection
            </button>
          </>
        )}

      </div>

      {/* Status counts */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {STATUS_OPTIONS.map((opt) => {
          const count = statusCounts[opt.value] || 0;
          if (count === 0) return null;
          const meta = flatStatusLabels[opt.value] || flatStatusLabels.pending;
          return (
            <span key={opt.value} style={{ fontSize: "0.82rem", padding: "3px 10px", borderRadius: 999, background: `${meta.color}22`, border: `1px solid ${meta.color}55`, color: meta.color }}>
              {opt.label}: {count}
            </span>
          );
        })}
      </div>

      <div className="tab-controls">
        <input
          className="search-input"
          placeholder="Search company, contact, project, notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <CustomDropdown
          options={[
            { value: "any", label: "Any Status" },
            ...STATUS_OPTIONS,
          ]}
          selected={filterStatus}
          onChange={(v) => setFilterStatus(v)}
          placeholder="Status"
        />

        <CustomDropdown
          options={[
            { value: "any", label: "Any Priority" },
            ...PRIORITY_OPTIONS,
          ]}
          selected={filterPriority}
          onChange={(v) => setFilterPriority(v)}
          placeholder="Priority"
        />

        <CustomDropdown
          options={[
            { value: "any", label: "All Requests" },
            { value: "active", label: "Active Only" },
            { value: "archived", label: "Archived Only" },
          ]}
          selected={filterArchived}
          onChange={(v) => setFilterArchived(v)}
          placeholder="Archive"
        />

        <CustomDropdown
          options={[
            { value: "any", label: "Any Assignment" },
            { value: "unassigned", label: "Unassigned" },
            ...getUniqueAssigned.map((name) => ({ value: name, label: name })),
          ]}
          selected={filterAssigned}
          onChange={(v) => setFilterAssigned(v)}
          placeholder="Assigned To"
        />

        <CustomDropdown
          options={[
            { value: "createdDesc", label: "Newest" },
            { value: "createdAsc", label: "Oldest" },
            { value: "companyAsc", label: "Company A→Z" },
            { value: "companyDesc", label: "Company Z→A" },
          ]}
          selected={sortBy}
          onChange={(v) => setSortBy(v)}
          placeholder="Sort"
        />

        <div className="result-count">{filtered.length} results</div>
      </div>

      {filtered.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", marginBottom: 4 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#c4b5fd", fontSize: "0.85rem", cursor: "pointer" }}>
            <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} style={{ width: 16, height: 16, cursor: "pointer" }} />
            Select All ({filtered.length})
          </label>
        </div>
      )}

      {filtered.map((item, index) => {
        const statusMeta = flatStatusLabels[item.status] || flatStatusLabels.pending;
        const priorityMeta = flatPriorityLabels[item.priority] || flatPriorityLabels.medium;
        const isExpanded = expandedId === item.id;
        const activityLog = item.activityLog || [];

        return (
          <div
            key={item.id || index}
            id={item.id ? `enterprise-request-${item.id}` : undefined}
            className="request-card"
            style={{
              borderLeft: item.archived
                ? "4px solid rgba(107,114,128,0.3)"
                : "4px solid rgba(59,130,246,0.3)",
              opacity: item.archived ? 0.6 : 1,
            }}
          >
            <div className="card-header">
              <h3>
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  style={{ marginRight: 8, width: 16, height: 16, cursor: "pointer" }}
                  onClick={(e) => e.stopPropagation()}
                />
                {item.companyName || "—"}
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {item.lifecyclePhase && (
                  <span className={`lifecycle-badge lifecycle-${item.lifecyclePhase}`}>
                    {LIFECYCLE_PHASES.find(p => p.value === item.lifecyclePhase)?.label || item.lifecyclePhase}
                  </span>
                )}
                {item.websiteStatus && (
                  <span className={`website-badge website-${item.websiteStatus}`}>
                    {WEBSITE_STATUSES.find(w => w.value === item.websiteStatus)?.label || item.websiteStatus}
                  </span>
                )}
                {item.paymentStatus && (
                  <span className={`payment-badge payment-${item.paymentStatus}`}>
                    {PAYMENT_STATUSES.find(p => p.value === item.paymentStatus)?.label || item.paymentStatus}
                  </span>
                )}
                <span className="badge" style={{ background: statusMeta.color, color: "#fff" }}>
                  {statusMeta.label}
                </span>
                <span className="badge" style={{ background: priorityMeta.color, color: "#fff" }}>
                  {priorityMeta.label}
                </span>
                {item.archived && (
                  <span className="badge" style={{ background: "#6b7280", color: "#fff" }}>
                    Archived
                  </span>
                )}
                <div className="menu-container">
                  <span className="menu-icon" onClick={(e) => toggleMenu(index, e)}>&#x22EE;</span>
                  {menuOpen === index && menuPos && (
                    <div className="menu-dropdown" style={{ top: menuPos.top, left: menuPos.left, maxHeight: `min(500px, ${window.innerHeight - menuPos.top - 8}px)` }}>
                      <div className="menu-section-label">Project</div>
                      <span className="menu-item" onClick={() => { closeMenu(); handleEditRequest(item); }}>View / Edit Details</span>
                      <hr className="menu-divider" />
                      <div className="menu-section-label">Status</div>
                      {STATUS_OPTIONS.map((opt) => (
                        <span key={opt.value} className="menu-item"
                          onClick={() => updateStatus(item.id, opt.value)}
                          style={{ color: opt.value === item.status ? "#22c55e" : "#e9d5ff" }}>
                          {opt.label}
                        </span>
                      ))}
                      <hr className="menu-divider" />
                      <div className="menu-section-label">Priority</div>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <span key={opt.value} className="menu-item"
                          onClick={() => updatePriority(item.id, opt.value)}
                          style={{ color: opt.value === item.priority ? "#22c55e" : "#fbbf24" }}>
                          {opt.label}
                        </span>
                      ))}
                      <hr className="menu-divider" />
                      <div className="menu-section-label">Billing</div>
                      <span className="menu-item warning" onClick={() => { closeMenu(); handleOpenCreditModal(item); }}>Manage Credits</span>
                      <hr className="menu-divider" />
                      <div className="menu-section-label">Team</div>
                      <span className="menu-item" onClick={() => handleAssign(item)}>
                        {item.assignedTo ? `Assigned: ${item.assignedTo}` : "Assign Team Member"}
                      </span>
                      <hr className="menu-divider" />
                      {item.archived ? (
                        <span className="menu-item success" onClick={() => handleRestore(item)}>Restore</span>
                      ) : (
                        <span className="menu-item warning" onClick={() => handleArchive(item)}>Archive</span>
                      )}
                      <span className="menu-item danger" onClick={() => handleDelete(item)}>Delete</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p><strong>Contact Person:</strong> <span className="value">{item.contactPerson || "—"}</span></p>
              <p><strong>Email:</strong> <span className="value">{item.email || "—"}</span></p>
              <p><strong>Phone:</strong> <span className="value">{item.phone || "—"}</span></p>
            <p><strong>Project:</strong> <span className="value">{item.projectTitle || "—"}</span></p>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "6px 0" }}>
              <span style={{ color: "#c4b5fd", fontSize: "0.9rem" }}>
                <strong>Org:</strong> {item.organizationType || "—"}
              </span>
              <span style={{ color: "#c4b5fd", fontSize: "0.9rem" }}>
                <strong>Industry:</strong> {item.industry || "—"}
              </span>
              <span style={{ color: "#c4b5fd", fontSize: "0.9rem" }}>
                <strong>Size:</strong> {item.companySize || "—"}
              </span>
              {item.assignedTo && (
                <span style={{ color: "#a78bfa", fontSize: "0.9rem" }}>
                  <strong>Assigned:</strong> {item.assignedTo}
                </span>
              )}
              {item.id && requestCredits[item.id] && (
                <span style={{ color: "#67e8f9", fontSize: "0.85rem" }}>
                  <strong>Credits:</strong> LC {requestCredits[item.id].largeCommits}/{ENTERPRISE_CREDIT_LIMITS.largeCommits} | SC {requestCredits[item.id].smallChanges}
                </span>
              )}
            </div>

            <p>
              <strong>Budget:</strong> <span className="value">{BUDGET_LABELS[item.estimatedBudget] || item.estimatedBudget || "—"}</span>
              <span style={{ marginLeft: 16 }}>
                <strong>Timeline:</strong> <span className="value">{TIMELINE_LABELS[item.expectedTimeline] || item.expectedTimeline || "—"}</span>
              </span>
            </p>

            <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
              <button onClick={() => toggleExpand(item.id)}>
                {isExpanded ? "Collapse Details" : "View Details"}
              </button>
            </div>

            {isExpanded && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(96,165,250,0.2)",
                  marginBottom: 12,
                }}
              >
                <h4 style={{ color: "#bfdbfe", margin: "0 0 8px" }}>Full Details</h4>

                <p><strong>Project Description:</strong></p>
                <p style={{ whiteSpace: "pre-wrap", color: "#e9d5ff" }}>{item.projectDescription || "—"}</p>

                {item.requiredFeatures && (
                  <p><strong>Required Features:</strong> <span className="value">{item.requiredFeatures}</span></p>
                )}
                {item.integrations && (
                  <p><strong>Integrations:</strong> <span className="value">{item.integrations}</span></p>
                )}
                {item.existingSystem && (
                  <p><strong>Existing System:</strong> <span className="value">{item.existingSystem}</span></p>
                )}
                <p><strong>Preferred Contact:</strong> <span className="value">{item.preferredContactMethod || "—"}</span></p>
                {item.notes && (
                  <p style={{ whiteSpace: "pre-wrap" }}><strong>Notes:</strong> <span className="value">{item.notes}</span></p>
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: item.firstYearFree ? "rgba(16, 185, 129, 0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${item.firstYearFree ? "rgba(16, 185, 129, 0.25)" : "rgba(255,255,255,0.1)"}`,
                    margin: "12px 0",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    updateEnterpriseDoc(item.id, { firstYearFree: !item.firstYearFree });
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!item.firstYearFree}
                    onChange={() => {}}
                    style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#22c55e" }}
                  />
                  <div>
                    <span style={{ color: item.firstYearFree ? "#d1fae5" : "#9ca3af", fontWeight: 600 }}>
                      First Year Free
                    </span>
                    <div style={{ fontSize: "0.72rem", fontWeight: 400, color: item.firstYearFree ? "#a7f3d0" : "#6b7280", marginTop: 2 }}>
                      *only if we build your site from scratch
                    </div>
                  </div>
                </div>

                <div style={{ margin: "14px 0", padding: 12, borderRadius: 10, border: "1px solid rgba(96,165,250,0.25)", background: "rgba(37,99,235,0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                    <h4 style={{ margin: 0, color: "#bfdbfe" }}>Invoices</h4>
                    <button onClick={() => openGenerateInvoiceModal(item)} style={{ padding: "8px 14px" }}>
                      Generate Invoice
                    </button>
                  </div>

                  {(invoicesByEnterpriseRequest[item.id] || []).length === 0 ? (
                    <p style={{ margin: 0, color: "#cbd5e1" }}>No invoices yet for this request.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {(invoicesByEnterpriseRequest[item.id] || []).map((invoice) => {
                        const invoicePaid = String(invoice.status || "unpaid").toLowerCase() === "paid";
                        return (
                          <div key={invoice.id} style={{ position: "relative", padding: 12, borderRadius: 8, background: "rgba(15,23,42,0.65)", border: `1px solid ${invoicePaid ? "rgba(34,197,94,0.45)" : "rgba(249,115,22,0.45)"}`, overflow: "hidden" }}>
                            <div style={{ position: "absolute", top: 10, right: 10 }}>
                              <span className="badge" style={{ background: invoicePaid ? "rgba(34,197,94,0.18)" : "rgba(249,115,22,0.18)", color: invoicePaid ? "#bbf7d0" : "#fed7aa", border: `1px solid ${invoicePaid ? "#22c55e" : "#f97316"}`, fontWeight: 800, letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <span aria-hidden="true">{invoicePaid ? "✓" : "!"}</span>
                                {invoicePaid ? "PAID" : "UNPAID"}
                              </span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                              <div>
                                <div style={{ fontWeight: 700, color: "#fff" }}>{invoice.invoiceId}</div>
                                <div style={{ color: "#cbd5e1", fontSize: "0.92rem" }}>{invoice.planName || "—"}</div>
                                <div style={{ color: "#cbd5e1", fontSize: "0.92rem" }}>{formatCurrency(invoice.amount)}</div>
                                <div style={{ color: "#cbd5e1", fontSize: "0.92rem" }}>Billing: {formatDateOnly(invoice.billingStartDate) || "—"} to {formatDateOnly(invoice.billingEndDate) || "—"}</div>
                                {invoice.clientOrganization && <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: 4 }}>{invoice.clientOrganization}</div>}
                                {invoice.clientEmail && <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{invoice.clientEmail}</div>}
                                {invoicePaid && invoice.paymentMethod && (
                                  <div style={{ color: "#86efac", fontSize: "0.82rem", marginTop: 4 }}>
                                    Paid via {invoice.paymentMethod}{invoice.transactionReference ? ` (${invoice.transactionReference})` : ""}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              <button type="button" onClick={() => openInvoiceModal(invoice, "edit")}>Edit</button>
                              {!invoicePaid ? (
                                <button type="button" onClick={() => openInvoiceModal(invoice, "markPaid")}>Mark as Paid</button>
                              ) : (
                                <span style={{ color: "#22c55e", fontWeight: 700, alignSelf: "center" }}>Already Paid</span>
                              )}
                              <button type="button" onClick={() => handleDownloadInvoice(invoice)}>Download</button>
                              <button type="button" onClick={() => handleCopyInvoiceId(invoice)}>Copy ID</button>
                              <button type="button" onClick={() => handleCopyInvoiceMessage(invoice)}>Copy Full Msg</button>
                              <button type="button" onClick={() => handleCopyShortInvoiceMessage(invoice)}>Copy Short Msg</button>
                              <button type="button" onClick={() => handleDeleteInvoice(invoice)} style={{ backgroundColor: "#7f1d1d", border: "1px solid #ef4444", color: "#fff" }}>Delete</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 12 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontWeight: "bold",
                      color: "#f5d0fe",
                    }}
                  >
                    Internal Notes
                    <span style={{ fontWeight: 400, color: "#c4b5fd" }}> (private)</span>
                  </label>
                  <textarea
                    value={notesDrafts[item.id] ?? String(item.notes || "")}
                    onChange={(e) =>
                      setNotesDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    placeholder="Add internal notes. Visible only in the admin dashboard."
                    rows={4}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      resize: "vertical",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(167,139,250,0.35)",
                      background: "rgba(17,24,39,0.85)",
                      color: "#fff",
                      font: "inherit",
                      lineHeight: 1.5,
                      marginBottom: "8px",
                    }}
                  />
                  <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ color: "#c4b5fd", fontSize: "0.85rem" }}>
                      {item.updatedAt ? `Last updated: ${formatDateTime(item.updatedAt)}` : ""}
                    </span>
                    <button
                      onClick={() => handleSaveNotes(item)}
                      disabled={notesSaving[item.id]}
                      style={{
                        padding: "8px 14px",
                        backgroundColor: notesSaving[item.id] ? "#4b5563" : "#6b21a8",
                        border: "none",
                        borderRadius: "6px",
                        color: "#fff",
                        cursor: notesSaving[item.id] ? "not-allowed" : "pointer",
                        opacity: notesSaving[item.id] ? 0.7 : 1,
                      }}
                    >
                      {notesSaving[item.id] ? "Saving..." : "Save Notes"}
                    </button>
                  </div>
                </div>

                {activityLog.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <h4 style={{ color: "#fbbf24", margin: "0 0 8px" }}>Activity Log</h4>
                    <div style={{ display: "grid", gap: 4 }}>
                      {activityLog.slice().reverse().map((entry, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: "0.85rem",
                            color: "#cbd5e1",
                            padding: "4px 0",
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                          }}
                        >
                          <span style={{ color: "#6b7280", marginRight: 8 }}>
                            {formatDateTime(entry.timestamp)}
                          </span>
                          {entry.action}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <p>
              <strong>Created:</strong>{" "}
              <span className="value">
                {item.createdAt ? formatDateTime(item.createdAt) : "—"}
              </span>
            </p>
            <p>
              <strong>Accepted Terms:</strong>{" "}
              <span className="value">{item.acceptedTerms ? "Yes" : "No"}</span>
            </p>

            <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #6b21a8" }} />
          </div>
        );
      })}

      {/* Create Custom Enterprise Request Modal */}
      {customModal.open && (
        <div className="modal-overlay" onClick={() => { if (!customModal.saving) setCustomModal({ open: false, saving: false }); }}>
          <div className="modal-content" style={{ maxWidth: 520, width: "100%", maxHeight: "86vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", color: "#fbbf24" }}>Create Custom Enterprise Request</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input className="search-input" placeholder="Company Name *" value={customForm.companyName} onChange={(e) => setCustomForm({ ...customForm, companyName: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Contact Person *" value={customForm.contactPerson} onChange={(e) => setCustomForm({ ...customForm, contactPerson: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Email *" type="email" value={customForm.email} onChange={(e) => setCustomForm({ ...customForm, email: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Phone" value={customForm.phone} onChange={(e) => setCustomForm({ ...customForm, phone: e.target.value })} style={{ width: "100%" }} />

              <select className="search-input" value={customForm.organizationType} onChange={(e) => setCustomForm({ ...customForm, organizationType: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="">Organization Type</option>
                <option value="startup">Startup</option>
                <option value="sme">Small / Medium Enterprise</option>
                <option value="enterprise">Large Enterprise</option>
                <option value="nonprofit">Non-Profit</option>
                <option value="government">Government</option>
                <option value="educational">Educational</option>
                <option value="other">Other</option>
              </select>

              <input className="search-input" placeholder="Industry" value={customForm.industry} onChange={(e) => setCustomForm({ ...customForm, industry: e.target.value })} style={{ width: "100%" }} />

              <select className="search-input" value={customForm.companySize} onChange={(e) => setCustomForm({ ...customForm, companySize: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="">Company Size</option>
                <option value="1-10">1-10 employees</option>
                <option value="11-50">11-50 employees</option>
                <option value="51-200">51-200 employees</option>
                <option value="201-1000">201-1000 employees</option>
                <option value="1000+">1000+ employees</option>
              </select>

              <input className="search-input" placeholder="Project Title *" value={customForm.projectTitle} onChange={(e) => setCustomForm({ ...customForm, projectTitle: e.target.value })} style={{ width: "100%" }} />

              <textarea className="search-input" placeholder="Project Description" value={customForm.projectDescription} onChange={(e) => setCustomForm({ ...customForm, projectDescription: e.target.value })} rows={3} style={{ width: "100%", resize: "vertical" }} />

              <select className="search-input" value={customForm.estimatedBudget} onChange={(e) => setCustomForm({ ...customForm, estimatedBudget: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="">Estimated Budget</option>
                <option value="under-1l">Under ₹1,00,000</option>
                <option value="1l-5l">₹1,00,000 - ₹5,00,000</option>
                <option value="5l-10l">₹5,00,000 - ₹10,00,000</option>
                <option value="10l-25l">₹10,00,000 - ₹25,00,000</option>
                <option value="25l+">₹25,00,000+</option>
                <option value="not-sure">Not sure / To be discussed</option>
              </select>

              <select className="search-input" value={customForm.expectedTimeline} onChange={(e) => setCustomForm({ ...customForm, expectedTimeline: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="">Expected Timeline</option>
                <option value="urgent">ASAP (Within 1 month)</option>
                <option value="short">1-3 months</option>
                <option value="medium">3-6 months</option>
                <option value="long">6+ months</option>
                <option value="planning">Still planning</option>
              </select>

              <select className="search-input" value={customForm.preferredContactMethod} onChange={(e) => setCustomForm({ ...customForm, preferredContactMethod: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="">Preferred Contact Method</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="video">Video Call</option>
                <option value="in-person">In Person</option>
              </select>

              <label style={{ color: "#c4b5fd", fontSize: "0.85rem", fontWeight: 600 }}>Project Start Date</label>
              <input type="date" className="search-input" value={customForm.startDate} onChange={(e) => setCustomForm({ ...customForm, startDate: e.target.value })} style={{ width: "100%", colorScheme: "dark" }} />

              <label style={{ color: "#c4b5fd", fontSize: "0.85rem", fontWeight: 600 }}>Project End Date</label>
              <input type="date" className="search-input" value={customForm.endDate} onChange={(e) => setCustomForm({ ...customForm, endDate: e.target.value })} style={{ width: "100%", colorScheme: "dark" }} />

              <textarea className="search-input" placeholder="Notes" value={customForm.notes} onChange={(e) => setCustomForm({ ...customForm, notes: e.target.value })} rows={2} style={{ width: "100%", resize: "vertical" }} />
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setCustomModal({ open: false, saving: false })} disabled={customModal.saving} style={{ padding: "10px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={submitCustomEnterpriseRequest}
                disabled={customModal.saving || !customForm.companyName.trim() || !customForm.contactPerson.trim() || !customForm.email.trim()}
                style={{
                  padding: "10px 20px",
                  background: customModal.saving || !customForm.companyName.trim() || !customForm.contactPerson.trim() || !customForm.email.trim() ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #7c3aed, #a78bfa)",
                  border: "none", borderRadius: 6, color: "#fff",
                  cursor: customModal.saving || !customForm.companyName.trim() || !customForm.contactPerson.trim() || !customForm.email.trim() ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {customModal.saving ? "Creating..." : "Create Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {invoiceModal.open && invoiceModal.draft && (
        <div className="modal-overlay" onClick={closeInvoiceModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "86vh", overflowY: "auto" }}>
            <h3>
              {invoiceModal.mode === "generate" ? "Generate Invoice" : invoiceModal.mode === "markPaid" ? "Mark Invoice as Paid" : "Edit Invoice"}
            </h3>
            <div style={{ display: "grid", gap: 12 }}>
              {invoiceModal.mode === "generate" && (
                <p style={{ margin: 0, color: "#cbd5e1" }}>Review the prefilled details before saving the invoice.</p>
              )}
              {invoiceModal.mode === "generate" && (
                <label>
                  Invoice ID
                  <input value={invoiceModal.invoiceId || "Will be generated on save"} disabled style={{ opacity: 0.6, cursor: "not-allowed" }} />
                </label>
              )}
              <label>
                Client Name
                <input value={invoiceModal.draft.clientName} onChange={(e) => updateInvoiceDraft("clientName", e.target.value)} />
              </label>
              <label>
                Client Email
                <input value={invoiceModal.draft.clientEmail} onChange={(e) => updateInvoiceDraft("clientEmail", e.target.value)} />
              </label>
              <label>
                Client Phone
                <input value={invoiceModal.draft.clientPhone} onChange={(e) => updateInvoiceDraft("clientPhone", e.target.value)} />
              </label>
              <label>
                Client Organization
                <input value={invoiceModal.draft.clientOrganization} onChange={(e) => updateInvoiceDraft("clientOrganization", e.target.value)} />
              </label>
              <label>
                Project Name
                <input value={invoiceModal.draft.projectName} onChange={(e) => updateInvoiceDraft("projectName", e.target.value)} />
              </label>
              <label>
                Plan Name
                <input value={invoiceModal.draft.planName} onChange={(e) => updateInvoiceDraft("planName", e.target.value)} />
              </label>
              <label>
                Amount
                <input type="number" min="0" value={invoiceModal.draft.amount} onChange={(e) => updateInvoiceDraft("amount", e.target.value)} />
              </label>
              <label>
                Billing Start Date
                <input type="date" value={invoiceModal.draft.billingStartDate} onChange={(e) => updateInvoiceDraft("billingStartDate", e.target.value)} />
              </label>
              <label>
                Billing End Date
                <input type="date" value={invoiceModal.draft.billingEndDate} onChange={(e) => updateInvoiceDraft("billingEndDate", e.target.value)} />
              </label>
              <label>
                Status
                <select value={invoiceModal.draft.status} onChange={(e) => updateInvoiceDraft("status", e.target.value)}>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              <label>
                Payment Method
                <select value={invoiceModal.draft.paymentMethod} onChange={(e) => updateInvoiceDraft("paymentMethod", e.target.value)}>
                  <option value="">Select payment method</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                </select>
              </label>
              <label>
                Transaction Reference
                <input value={invoiceModal.draft.transactionReference} onChange={(e) => updateInvoiceDraft("transactionReference", e.target.value)} placeholder="Optional" />
              </label>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={closeInvoiceModal} style={{ padding: "10px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={saveInvoiceModal}
                disabled={invoiceModal.saving}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#2563eb",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  cursor: invoiceModal.saving ? "not-allowed" : "pointer",
                  opacity: invoiceModal.saving ? 0.7 : 1,
                }}
              >
                {invoiceModal.saving ? "Saving..." : invoiceModal.mode === "markPaid" ? "Save Payment" : "Save Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Enterprise Request Modal */}
      {editModal.open && (
        <div className="modal-overlay" onClick={() => { if (!editModal.saving) setEditModal({ open: false, saving: false, request: null }); }}>
          <div className="modal-content" style={{ maxWidth: 520, width: "100%", maxHeight: "86vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", color: "#fbbf24" }}>Edit Enterprise Request</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input className="search-input" placeholder="Company Name *" value={editForm.companyName} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Contact Person *" value={editForm.contactPerson} onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Email *" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} style={{ width: "100%" }} />

              <select className="search-input" value={editForm.organizationType} onChange={(e) => setEditForm({ ...editForm, organizationType: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="">Organization Type</option>
                <option value="startup">Startup</option>
                <option value="sme">Small / Medium Enterprise</option>
                <option value="enterprise">Large Enterprise</option>
                <option value="nonprofit">Non-Profit</option>
                <option value="government">Government</option>
                <option value="educational">Educational</option>
                <option value="other">Other</option>
              </select>

              <input className="search-input" placeholder="Industry" value={editForm.industry} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} style={{ width: "100%" }} />

              <select className="search-input" value={editForm.companySize} onChange={(e) => setEditForm({ ...editForm, companySize: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="">Company Size</option>
                <option value="1-10">1-10 employees</option>
                <option value="11-50">11-50 employees</option>
                <option value="51-200">51-200 employees</option>
                <option value="201-1000">201-1000 employees</option>
                <option value="1000+">1000+ employees</option>
              </select>

              <input className="search-input" placeholder="Project Title *" value={editForm.projectTitle} onChange={(e) => setEditForm({ ...editForm, projectTitle: e.target.value })} style={{ width: "100%" }} />

              <textarea className="search-input" placeholder="Project Description" value={editForm.projectDescription} onChange={(e) => setEditForm({ ...editForm, projectDescription: e.target.value })} rows={3} style={{ width: "100%", resize: "vertical" }} />

              <select className="search-input" value={editForm.estimatedBudget} onChange={(e) => setEditForm({ ...editForm, estimatedBudget: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="">Estimated Budget</option>
                <option value="under-1l">Under ₹1,00,000</option>
                <option value="1l-5l">₹1,00,000 - ₹5,00,000</option>
                <option value="5l-10l">₹5,00,000 - ₹10,00,000</option>
                <option value="10l-25l">₹10,00,000 - ₹25,00,000</option>
                <option value="25l+">₹25,00,000+</option>
                <option value="not-sure">Not sure / To be discussed</option>
              </select>

              <select className="search-input" value={editForm.expectedTimeline} onChange={(e) => setEditForm({ ...editForm, expectedTimeline: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="">Expected Timeline</option>
                <option value="urgent">ASAP (Within 1 month)</option>
                <option value="short">1-3 months</option>
                <option value="medium">3-6 months</option>
                <option value="long">6+ months</option>
                <option value="planning">Still planning</option>
              </select>

              <input className="search-input" placeholder="Required Features" value={editForm.requiredFeatures} onChange={(e) => setEditForm({ ...editForm, requiredFeatures: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Integrations" value={editForm.integrations} onChange={(e) => setEditForm({ ...editForm, integrations: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Existing System" value={editForm.existingSystem} onChange={(e) => setEditForm({ ...editForm, existingSystem: e.target.value })} style={{ width: "100%" }} />

              <select className="search-input" value={editForm.preferredContactMethod} onChange={(e) => setEditForm({ ...editForm, preferredContactMethod: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="">Preferred Contact Method</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="video">Video Call</option>
                <option value="in-person">In Person</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setEditModal({ open: false, saving: false, request: null })} disabled={editModal.saving} style={{ padding: "10px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={submitEditRequest}
                disabled={editModal.saving || !editForm.companyName.trim() || !editForm.contactPerson.trim() || !editForm.email.trim()}
                style={{
                  padding: "10px 20px",
                  background: editModal.saving || !editForm.companyName.trim() || !editForm.contactPerson.trim() || !editForm.email.trim() ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #7c3aed, #a78bfa)",
                  border: "none", borderRadius: 6, color: "#fff",
                  cursor: editModal.saving || !editForm.companyName.trim() || !editForm.contactPerson.trim() || !editForm.email.trim() ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {editModal.saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Modal */}
      {bulkActionModal.open && (
        <div className="modal-overlay" onClick={() => setBulkActionModal({ open: false })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", color: "#fbbf24" }}>Bulk Update ({selectedIds.size} requests)</h3>
            <p style={{ marginBottom: 16, color: "#cbd5e1" }}>Choose a field and value to apply to all selected requests.</p>

            <label style={{ fontWeight: "bold", display: "block", marginBottom: 8 }}>Change Status</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => submitBulkAction("status", opt.value)}
                  style={{ padding: "8px 14px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <label style={{ fontWeight: "bold", display: "block", marginBottom: 8 }}>Change Priority</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => submitBulkAction("priority", opt.value)}
                  style={{ padding: "8px 14px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setBulkActionModal({ open: false })} style={{ padding: "10px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Management Modal */}
      {creditModal.open && creditModal.request && (
        <div className="modal-overlay" onClick={closeCreditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ margin: "0 0 16px", color: "#fbbf24" }}>Manage Credits</h3>
            <p style={{ color: "#cbd5e1", marginBottom: 16 }}>
              Managing credits for <strong>{creditModal.request.companyName}</strong>
            </p>

            {(() => {
              const credits = requestCredits[creditModal.request.id] || { largeCommits: 0, smallChanges: 0 };
              const largeCommitLimit = ENTERPRISE_CREDIT_LIMITS.largeCommits;
              const smallChangeLimit = ENTERPRISE_CREDIT_LIMITS.smallChanges;
              const remainingLarge = largeCommitLimit - credits.largeCommits;
              const remainingSmall = smallChangeLimit !== null ? smallChangeLimit - credits.smallChanges : "Unlimited";

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* Large Commits */}
                  <div style={{ padding: 16, borderRadius: 10, border: "1px solid rgba(96,165,250,0.3)", background: "rgba(30,58,138,0.2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ color: "#bfdbfe", fontWeight: 700, fontSize: "1.1rem" }}>Large Commits</span>
                      <span style={{ color: "#93c5fd", fontSize: "0.9rem" }}>{remainingLarge} remaining</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        onClick={() => removeCreditFromEnterpriseRequest("largeCommit")}
                        disabled={credits.largeCommits <= 0}
                        style={{
                          width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
                          background: credits.largeCommits > 0 ? "#7f1d1d" : "rgba(255,255,255,0.05)",
                          color: credits.largeCommits > 0 ? "#ef4444" : "#666",
                          fontSize: "1.2rem", cursor: credits.largeCommits > 0 ? "pointer" : "not-allowed",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >−</button>
                      <span style={{ color: "#fff", fontSize: "1.8rem", fontWeight: 800, minWidth: 60, textAlign: "center" }}>
                        {credits.largeCommits}/{largeCommitLimit}
                      </span>
                      <button
                        onClick={() => addCreditToEnterpriseRequest("largeCommit")}
                        disabled={credits.largeCommits >= largeCommitLimit}
                        style={{
                          width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
                          background: credits.largeCommits < largeCommitLimit ? "#14532d" : "rgba(255,255,255,0.05)",
                          color: credits.largeCommits < largeCommitLimit ? "#22c55e" : "#666",
                          fontSize: "1.2rem", cursor: credits.largeCommits < largeCommitLimit ? "pointer" : "not-allowed",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >+</button>
                    </div>
                  </div>

                  {/* Small Changes */}
                  <div style={{ padding: 16, borderRadius: 10, border: "1px solid rgba(251,191,36,0.3)", background: "rgba(120,53,15,0.2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ color: "#fde68a", fontWeight: 700, fontSize: "1.1rem" }}>Small Changes</span>
                      <span style={{ color: "#fcd34d", fontSize: "0.9rem" }}>{remainingSmall} remaining</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        onClick={() => removeCreditFromEnterpriseRequest("smallChange")}
                        disabled={credits.smallChanges <= 0}
                        style={{
                          width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
                          background: credits.smallChanges > 0 ? "#7f1d1d" : "rgba(255,255,255,0.05)",
                          color: credits.smallChanges > 0 ? "#ef4444" : "#666",
                          fontSize: "1.2rem", cursor: credits.smallChanges > 0 ? "pointer" : "not-allowed",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >−</button>
                      <span style={{ color: "#fff", fontSize: "1.8rem", fontWeight: 800, minWidth: 60, textAlign: "center" }}>
                        {credits.smallChanges}/{smallChangeLimit !== null ? smallChangeLimit : "∞"}
                      </span>
                      <button
                        onClick={() => addCreditToEnterpriseRequest("smallChange")}
                        disabled={smallChangeLimit !== null && credits.smallChanges >= smallChangeLimit}
                        style={{
                          width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
                          background: smallChangeLimit === null || credits.smallChanges < smallChangeLimit ? "#14532d" : "rgba(255,255,255,0.05)",
                          color: smallChangeLimit === null || credits.smallChanges < smallChangeLimit ? "#22c55e" : "#666",
                          fontSize: "1.2rem", cursor: smallChangeLimit === null || credits.smallChanges < smallChangeLimit ? "pointer" : "not-allowed",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >+</button>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={closeCreditModal} style={{ padding: "10px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#fff", cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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

export default EnterpriseRequestsTab;
