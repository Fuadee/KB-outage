"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import {
  getResponsibleUnitShortLabel,
  RESPONSIBLE_UNITS,
  type ResponsibleUnit
} from "@/lib/jobMetadata";
import type { Person } from "@/lib/people";
import { inputLight } from "@/lib/theme";

type ActiveFilter = "true" | "false" | "all";

const emptyForm = { full_name: "", department: "" as ResponsibleUnit | "" };

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] =
    useState<ResponsibleUnit | "all">("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("true");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadPeople = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ active: activeFilter });
    if (departmentFilter !== "all") {
      params.set("department", departmentFilter);
    }
    if (query.trim()) params.set("q", query.trim());

    try {
      const response = await fetch(`/api/people?${params.toString()}`);
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "โหลดรายชื่อบุคลากรไม่สำเร็จ");
      }
      setPeople(result.data ?? []);
    } catch (loadError) {
      setPeople([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "โหลดรายชื่อบุคลากรไม่สำเร็จ"
      );
    } finally {
      setLoading(false);
    }
  }, [activeFilter, departmentFilter, query]);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  const openCreate = () => {
    setEditingPerson(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (person: Person) => {
    setEditingPerson(person);
    setForm({ full_name: person.full_name, department: person.department });
    setModalOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.full_name.trim() || !form.department) {
      setError("กรุณาระบุชื่อและสังกัด");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        editingPerson ? `/api/people/${editingPerson.id}` : "/api/people",
        {
          method: editingPerson ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: form.full_name.trim(),
            department: form.department
          })
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "บันทึกบุคลากรไม่สำเร็จ");
      }
      setModalOpen(false);
      setEditingPerson(null);
      setForm(emptyForm);
      await loadPeople();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "บันทึกบุคลากรไม่สำเร็จ"
      );
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (person: Person, isActive: boolean) => {
    setError(null);
    const response = await fetch(`/api/people/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: isActive })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "เปลี่ยนสถานะบุคลากรไม่สำเร็จ");
      return;
    }
    await loadPeople();
  };

  return (
    <div className="space-y-5">
      <Card className="!border-0 !bg-transparent !shadow-none">
        <CardContent className="space-y-4 !px-0 py-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="page-eyebrow">Master data</p>
              <h1 className="page-title">บุคลากร</h1>
              <p className="page-description">
                จัดการรายชื่อและสังกัดสำหรับเลือกใช้ในงานดับไฟ
              </p>
            </div>
            <Button onClick={openCreate}>เพิ่มบุคลากร</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาชื่อบุคลากร"
            />
            <select
              value={departmentFilter}
              onChange={(event) =>
                setDepartmentFilter(
                  event.target.value as ResponsibleUnit | "all"
                )
              }
              className={inputLight}
              aria-label="กรองตามสังกัด"
            >
              <option value="all">ทุกสังกัด</option>
              {RESPONSIBLE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {getResponsibleUnitShortLabel(unit)}
                </option>
              ))}
            </select>
            <select
              value={activeFilter}
              onChange={(event) =>
                setActiveFilter(event.target.value as ActiveFilter)
              }
              className={inputLight}
              aria-label="กรองตามสถานะ"
            >
              <option value="true">ใช้งาน</option>
              <option value="false">ปิดใช้งาน</option>
              <option value="all">ทั้งหมด</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3">
        {loading ? <p className="text-sm text-slate-600">กำลังโหลด...</p> : null}
        {!loading && !people.length ? (
          <p className="empty-state">ไม่พบบุคลากรตามเงื่อนไข</p>
        ) : null}
        {people.map((person) => (
          <Card key={person.id}>
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-900">{person.full_name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  สังกัด: {getResponsibleUnitShortLabel(person.department)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {person.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(person)}>
                  แก้ไข
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void setActive(person, !person.is_active)}
                >
                  {person.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal
        isOpen={modalOpen}
        title={editingPerson ? "แก้ไขบุคลากร" : "เพิ่มบุคลากร"}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            ชื่อ-นามสกุล
            <Input
              required
              maxLength={200}
              value={form.full_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, full_name: event.target.value }))
              }
              placeholder="ชื่อบุคลากร"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            สังกัด
            <select
              required
              value={form.department}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  department: event.target.value as ResponsibleUnit | ""
                }))
              }
              className={inputLight}
            >
              <option value="" disabled>เลือกสังกัด</option>
              {RESPONSIBLE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {getResponsibleUnitShortLabel(unit)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Modal>
    </div>
  );
}
