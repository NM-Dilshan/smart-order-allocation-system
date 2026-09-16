import ManagementAccess from "../../management-access";
import InquiryManager from "./inquiry-manager";

export const metadata = { title: "Customer Inquiries | Smart Order Allocation" };
export default function InquiriesPage() {
  return <ManagementAccess><InquiryManager /></ManagementAccess>;
}
