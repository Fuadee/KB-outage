"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Segmented from "@/components/ui/Segmented";

type CustomerStatus = "ACTIVE" | "INACTIVE";

type SpecialWatchCustomer = {
  id: string;
  customer_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  subdistrict: string | null;
  latitude: number | null;
  longitude: number | null;
  impact_reason: string | null;
  care_note: string | null;
  status: CustomerStatus;
};

type FormState = {
  customer_name: string;
  contact_name: string;
  contact_phone: string;
  address: string;
  subdistrict: string;
  latitude: string;
  longitude: string;
  impact_reason: string;
  care_note: string;
};

const emptyForm: FormState = {
  customer_name: "",
  contact_name: "",
  contact_phone: "",
  address: "",
  subdistrict: "",
  latitude: "",
  longitude: "",
  impact_reason: "",
  care_note: ""
};

export default function SpecialWatchlistPage() {
  const [customers, setCustomers] = useState<SpecialWatchCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus>("ACTIVE");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<SpecialWatchCustomer | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const fetchCustomers = useCallback(async (status: CustomerStatus, q: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ status });
    const trimmedQuery = q.trim();
    if (trimmedQuery) params.set("q", trimmedQuery);

    const response = await fetch(`/api/special-watchlist?${params.toString()}`);
    const result = await response.json();
    if (!response.ok || !result.ok) {
      setCustomers([]);
      setError(result.error ?? "ไม่สามารถดึงข้อมูลกลุ่มเฝ้าระวังพิเศษได้ กรุณาลองใหม่อีกครั้ง");
    } else {
      setCustomers((result.data ?? []) as SpecialWatchCustomer[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomers(statusFilter, query);
  }, [fetchCustomers, query, statusFilter]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (customer: SpecialWatchCustomer) => {
    setEditingCustomer(customer);
    setForm({
      customer_name: customer.customer_name,
      contact_name: customer.contact_name ?? "",
      contact_phone: customer.contact_phone ?? "",
      address: customer.address ?? "",
      subdistrict: customer.subdistrict ?? "",
      latitude: customer.latitude?.toString() ?? "",
      longitude: customer.longitude?.toString() ?? "",
      impact_reason: customer.impact_reason ?? "",
      care_note: customer.care_note ?? ""
    });
    setModalOpen(true);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.customer_name.trim()) return setError("กรุณาระบุชื่อผู้ใช้ไฟ/สถานที่");

    setSaving(true);
    setError(null);

    const payload = {
      customer_name: form.customer_name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      address: form.address.trim() || null,
      subdistrict: form.subdistrict.trim() || null,
      latitude: form.latitude.trim() ? Number(form.latitude) : null,
      longitude: form.longitude.trim() ? Number(form.longitude) : null,
      impact_reason: form.impact_reason.trim() || null,
      care_note: form.care_note.trim() || null
    };

    const response = await fetch(editingCustomer ? `/api/special-watchlist/${editingCustomer.id}` : "/api/special-watchlist", {
      method: editingCustomer ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      setError(result.error ?? "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
      setSaving(false);
      return;
    }

    setSaving(false);
    setModalOpen(false);
    setEditingCustomer(null);
    setForm(emptyForm);
    fetchCustomers(statusFilter, query);
  };

  const deactivateCustomer = async (id: string) => {
    const response = await fetch(`/api/special-watchlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) return setError(result.error ?? "ไม่สามารถปิดใช้งานได้ กรุณาลองใหม่อีกครั้ง");
    fetchCustomers(statusFilter, query);
  };

  return (
    <div className="space-y-5">
      <Card><CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">กลุ่มเฝ้าระวังพิเศษ</h1>
            <p className="text-sm text-slate-300">ฐานข้อมูลผู้ใช้ไฟที่ควรแจ้งล่วงหน้า/ดูแลเป็นพิเศษเมื่อมีงานดับไฟ</p>
          </div>
          <Button onClick={openCreateModal}>เพิ่มรายชื่อ</Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ / พื้นที่ / เบอร์ / เหตุผล" className="w-full sm:max-w-md" />
          <Segmented value={statusFilter} onChange={setStatusFilter} options={[{ id: "ACTIVE", label: "ACTIVE" }, { id: "INACTIVE", label: "INACTIVE" }]} />
        </div>
      </CardContent></Card>

      {error ? <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

      <div className="grid gap-3">
        {loading ? <p className="text-sm text-slate-300">กำลังโหลดข้อมูล...</p> : null}
        {!loading && customers.length === 0 ? <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</p> : null}
        {customers.map((customer) => {
          const shortImpactReason = customer.impact_reason?.slice(0, 80) ?? "-";
          const hasMap = customer.latitude !== null && customer.longitude !== null;
          return (
            <Card key={customer.id}><CardContent className="space-y-3 py-4">
              <div className="space-y-1">
                <p className="text-base font-semibold text-white">{customer.customer_name}</p>
                <p className="text-sm text-slate-300">พื้นที่: {customer.subdistrict || customer.address || "-"}</p>
                <p className="text-sm text-slate-300">เบอร์ผู้ประสาน: {customer.contact_phone || "-"}</p>
                <p className="text-sm text-slate-300">เหตุผลที่ต้องเฝ้าระวัง: {shortImpactReason}{(customer.impact_reason?.length ?? 0) > 80 ? "…" : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {hasMap ? <a href={`https://maps.google.com/?q=${customer.latitude},${customer.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-md border border-[#f97316]/60 px-3 py-2 text-xs font-semibold text-orange-200 hover:bg-orange-500/10">เปิดแผนที่</a> : null}
                <Button variant="secondary" size="sm" onClick={() => openEditModal(customer)}>แก้ไข</Button>
                {customer.status === "ACTIVE" ? <Button variant="ghost" size="sm" onClick={() => deactivateCustomer(customer.id)}>ปิดใช้งาน</Button> : null}
              </div>
            </CardContent></Card>
          );
        })}
      </div>

      <Modal isOpen={modalOpen} title={editingCustomer ? "แก้ไขข้อมูลกลุ่มเฝ้าระวังพิเศษ" : "เพิ่มรายชื่อกลุ่มเฝ้าระวังพิเศษ"} onClose={() => setModalOpen(false)} onSubmit={onSubmit}
        footer={<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>ยกเลิก</Button><Button type="submit" disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button></div>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input required placeholder="ชื่อผู้ใช้ไฟ/สถานที่" value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} />
          <Input placeholder="ชื่อผู้ประสาน" value={form.contact_name} onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))} />
          <Input placeholder="เบอร์ผู้ประสาน" value={form.contact_phone} onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))} />
          <Input placeholder="ตำบล/พื้นที่" value={form.subdistrict} onChange={(e) => setForm((p) => ({ ...p, subdistrict: e.target.value }))} />
          <Input placeholder="ละติจูด" value={form.latitude} onChange={(e) => setForm((p) => ({ ...p, latitude: e.target.value }))} />
          <Input placeholder="ลองจิจูด" value={form.longitude} onChange={(e) => setForm((p) => ({ ...p, longitude: e.target.value }))} />
          <Input className="sm:col-span-2" placeholder="ที่อยู่" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          <Input className="sm:col-span-2" placeholder="เหตุผลที่ต้องเฝ้าระวัง" value={form.impact_reason} onChange={(e) => setForm((p) => ({ ...p, impact_reason: e.target.value }))} />
          <Input className="sm:col-span-2" placeholder="หมายเหตุการดูแล" value={form.care_note} onChange={(e) => setForm((p) => ({ ...p, care_note: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
