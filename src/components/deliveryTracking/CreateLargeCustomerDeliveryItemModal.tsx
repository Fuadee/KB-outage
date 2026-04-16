import EditLargeCustomerDeliveryItemModal from "./EditLargeCustomerDeliveryItemModal";
import type { EditableTarget } from "./types";

type CreateLargeCustomerDeliveryItemModalProps = {
  open: boolean;
  item: EditableTarget | null;
  onClose: () => void;
  onChange: (patch: Partial<EditableTarget>) => void;
  onSubmit: () => void;
  fieldErrors: Record<string, string>;
};

export default function CreateLargeCustomerDeliveryItemModal(props: CreateLargeCustomerDeliveryItemModalProps) {
  return <EditLargeCustomerDeliveryItemModal {...props} title="เพิ่มรายการผู้ใช้ไฟฟ้ารายใหญ่" />;
}
