"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Segmented from "@/components/ui/Segmented";

type PatientStatus = "ACTIVE" | "INACTIVE";

type BedriddenPatient = {
  id: string;
  patient_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  subdistrict: string | null;
  latitude: number | null;
  longitude: number | null;
  power_dependency_note: string | null;
  care_note: string | null;
  status: PatientStatus;
};

type FormState = {
  patient_name: string;
  contact_name: string;
  contact_phone: string;
  address: string;
  subdistrict: string;
  latitude: string;
  longitude: string;
  power_dependency_note: string;
  care_note: string;
};

const emptyForm: FormState = {
  patient_name: "",
  contact_name: "",
  contact_phone: "",
  address: "",
  subdistrict: "",
  latitude: "",
  longitude: "",
  power_dependency_note: "",
  care_note: ""
};

export default function BedriddenPatientsPage() {
  const [patients, setPatients] = useState<BedriddenPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PatientStatus>("ACTIVE");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<BedriddenPatient | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const fetchPatients = useCallback(async (status: PatientStatus, q: string) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ status });
    const trimmedQuery = q.trim();
    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }

    const response = await fetch(`/api/bedridden-patients?${params.toString()}`);
    const result = await response.json();

    if (!response.ok || !result.ok) {
      setPatients([]);
      setError(result.error ?? "ไม่สามารถดึงข้อมูลผู้ป่วยได้ กรุณาลองใหม่อีกครั้ง");
    } else {
      setPatients((result.data ?? []) as BedriddenPatient[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPatients(statusFilter, query);
  }, [fetchPatients, query, statusFilter]);

  const openCreateModal = () => {
    setEditingPatient(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (patient: BedriddenPatient) => {
    setEditingPatient(patient);
    setForm({
      patient_name: patient.patient_name,
      contact_name: patient.contact_name ?? "",
      contact_phone: patient.contact_phone ?? "",
      address: patient.address ?? "",
      subdistrict: patient.subdistrict ?? "",
      latitude: patient.latitude?.toString() ?? "",
      longitude: patient.longitude?.toString() ?? "",
      power_dependency_note: patient.power_dependency_note ?? "",
      care_note: patient.care_note ?? ""
    });
    setModalOpen(true);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.patient_name.trim()) {
      setError("กรุณาระบุชื่อผู้ป่วย");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      patient_name: form.patient_name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      address: form.address.trim() || null,
      subdistrict: form.subdistrict.trim() || null,
      latitude: form.latitude.trim() ? Number(form.latitude) : null,
      longitude: form.longitude.trim() ? Number(form.longitude) : null,
      power_dependency_note: form.power_dependency_note.trim() || null,
      care_note: form.care_note.trim() || null
    };

    const response = await fetch(
      editingPatient ? `/api/bedridden-patients/${editingPatient.id}` : "/api/bedridden-patients",
      {
        method: editingPatient ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    const result = await response.json();
    if (!response.ok || !result.ok) {
      setError(result.error ?? "ไม่สามารถบันทึกข้อมูลผู้ป่วยได้ กรุณาลองใหม่อีกครั้ง");
      setSaving(false);
      return;
    }

    setSaving(false);
    setModalOpen(false);
    setEditingPatient(null);
    setForm(emptyForm);
    fetchPatients(statusFilter, query);
  };

  const deactivatePatient = async (id: string) => {
    const response = await fetch(`/api/bedridden-patients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" })
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      setError(result.error ?? "ไม่สามารถปิดใช้งานผู้ป่วยได้ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    fetchPatients(statusFilter, query);
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-white">ผู้ป่วยติดเตียง / กลุ่มเปราะบาง</h1>
              <p className="text-sm text-slate-300">ฐานข้อมูลสำหรับเตรียมประเมินผลกระทบจากงานดับไฟ (Phase 1)</p>
            </div>
            <Button onClick={openCreateModal}>เพิ่มผู้ป่วย</Button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาชื่อ / พื้นที่ / เบอร์ / หมายเหตุ"
              className="w-full sm:max-w-md"
            />
            <Segmented
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { id: "ACTIVE", label: "ACTIVE" },
                { id: "INACTIVE", label: "INACTIVE" }
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {error ? <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

      <div className="grid gap-3">
        {loading ? <p className="text-sm text-slate-300">กำลังโหลดข้อมูล...</p> : null}
        {!loading && patients.length === 0 ? (
          <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</p>
        ) : null}

        {patients.map((patient) => {
          const shortPowerNote = patient.power_dependency_note?.slice(0, 80) ?? "-";
          const hasMap = patient.latitude !== null && patient.longitude !== null;

          return (
            <Card key={patient.id}>
              <CardContent className="space-y-3 py-4">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-white">{patient.patient_name}</p>
                  <p className="text-sm text-slate-300">พื้นที่: {patient.subdistrict || patient.address || "-"}</p>
                  <p className="text-sm text-slate-300">เบอร์ผู้ประสาน: {patient.contact_phone || "-"}</p>
                  <p className="text-sm text-slate-300">หมายเหตุไฟฟ้าจำเป็น: {shortPowerNote}{(patient.power_dependency_note?.length ?? 0) > 80 ? "…" : ""}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {hasMap ? (
                    <a
                      href={`https://maps.google.com/?q=${patient.latitude},${patient.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-md border border-[#f97316]/60 px-3 py-2 text-xs font-semibold text-orange-200 hover:bg-orange-500/10"
                    >
                      เปิดแผนที่
                    </a>
                  ) : null}
                  <Button variant="secondary" size="sm" onClick={() => openEditModal(patient)}>แก้ไข</Button>
                  {patient.status === "ACTIVE" ? (
                    <Button variant="ghost" size="sm" onClick={() => deactivatePatient(patient.id)}>ปิดใช้งาน</Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Modal
        isOpen={modalOpen}
        title={editingPatient ? "แก้ไขข้อมูลผู้ป่วย" : "เพิ่มผู้ป่วย"}
        onClose={() => setModalOpen(false)}
        onSubmit={onSubmit}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>ยกเลิก</Button>
            <Button type="submit" disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input required placeholder="ชื่อผู้ป่วย" value={form.patient_name} onChange={(event) => setForm((prev) => ({ ...prev, patient_name: event.target.value }))} />
          <Input placeholder="ชื่อผู้ประสาน" value={form.contact_name} onChange={(event) => setForm((prev) => ({ ...prev, contact_name: event.target.value }))} />
          <Input placeholder="เบอร์ผู้ประสาน" value={form.contact_phone} onChange={(event) => setForm((prev) => ({ ...prev, contact_phone: event.target.value }))} />
          <Input placeholder="ตำบล/พื้นที่" value={form.subdistrict} onChange={(event) => setForm((prev) => ({ ...prev, subdistrict: event.target.value }))} />
          <Input placeholder="ละติจูด" value={form.latitude} onChange={(event) => setForm((prev) => ({ ...prev, latitude: event.target.value }))} />
          <Input placeholder="ลองจิจูด" value={form.longitude} onChange={(event) => setForm((prev) => ({ ...prev, longitude: event.target.value }))} />
          <Input className="sm:col-span-2" placeholder="ที่อยู่" value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} />
          <Input className="sm:col-span-2" placeholder="หมายเหตุไฟฟ้าจำเป็น" value={form.power_dependency_note} onChange={(event) => setForm((prev) => ({ ...prev, power_dependency_note: event.target.value }))} />
          <Input className="sm:col-span-2" placeholder="หมายเหตุการดูแล" value={form.care_note} onChange={(event) => setForm((prev) => ({ ...prev, care_note: event.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
