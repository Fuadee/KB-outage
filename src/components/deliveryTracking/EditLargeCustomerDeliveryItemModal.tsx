import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { EditableTarget } from "./types";

type EditLargeCustomerDeliveryItemModalProps = {
  open: boolean;
  item: EditableTarget | null;
  title?: string;
  onClose: () => void;
  onChange: (patch: Partial<EditableTarget>) => void;
  onSubmit: () => void;
  fieldErrors: Record<string, string>;
};

export default function EditLargeCustomerDeliveryItemModal({
  open,
  item,
  title = "แก้ไขรายการผู้ใช้ไฟ",
  onClose,
  onChange,
  onSubmit,
  fieldErrors
}: EditLargeCustomerDeliveryItemModalProps) {
  if (!item) return null;

  const getError = (field: string) => fieldErrors[`${item.tempId}:${field}`];

  return (
    <Modal isOpen={open} onClose={onClose} title={title} panelClassName="max-w-2xl">
      <div className="grid gap-3">
        <Input type="text" value={item.company_name} onChange={(event) => onChange({ company_name: event.target.value })} placeholder="ชื่อลูกค้า" className={getError("company_name") ? "border-red-400" : undefined} />
        {getError("company_name") ? <p className="text-xs text-red-400">{getError("company_name")}</p> : null}
        <Input
          type="text"
          value={item.customerTypeInput}
          onChange={(event) => onChange({ customerTypeInput: event.target.value, note: event.target.value.trim() || null })}
          placeholder="ประเภท (ไม่บังคับ)"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input type="number" value={item.latitudeInput} onChange={(event) => onChange({ latitudeInput: event.target.value })} placeholder="Latitude" className={getError("latitude") ? "border-red-400" : undefined} />
          <Input type="number" value={item.longitudeInput} onChange={(event) => onChange({ longitudeInput: event.target.value })} placeholder="Longitude" className={getError("longitude") ? "border-red-400" : undefined} />
        </div>
        {getError("latitude") ? <p className="text-xs text-red-400">{getError("latitude")}</p> : null}
        {getError("longitude") ? <p className="text-xs text-red-400">{getError("longitude")}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button type="button" onClick={onSubmit}>💾 บันทึกข้อมูลลูกค้า</Button>
        </div>
      </div>
    </Modal>
  );
}
