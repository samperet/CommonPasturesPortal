import { EquipmentPage } from "@/components/equipment/equipment-page";

export const metadata = { title: "Equipment · Common Pastures" };

export default function Page({ params }: { params: { id: string; itemId: string } }) {
  return <EquipmentPage circleId={params.id} itemId={params.itemId} />;
}
