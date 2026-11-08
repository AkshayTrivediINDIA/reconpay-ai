"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FieldHint } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export type VendorFormValues = {
  name: string;
  code: string;
  email: string;
  phone: string;
  taxId: string;
  address: string;
  currency: string;
  paymentTermsDays: string;
  status: "ACTIVE" | "INACTIVE" | "ON_HOLD";
  notes: string;
};

function initialValues(overrides?: Partial<VendorFormValues>): VendorFormValues {
  return {
    name: "",
    code: "",
    email: "",
    phone: "",
    taxId: "",
    address: "",
    currency: "INR",
    paymentTermsDays: "30",
    status: "ACTIVE",
    notes: "",
    ...overrides,
  };
}

function payload(values: VendorFormValues) {
  return {
    name: values.name,
    code: values.code,
    email: values.email || null,
    phone: values.phone || null,
    taxId: values.taxId || null,
    address: values.address || null,
    currency: values.currency,
    paymentTermsDays: Number(values.paymentTermsDays || "30"),
    status: values.status,
    notes: values.notes || null,
  };
}

function VendorFields({
  values,
  onChange,
}: {
  values: VendorFormValues;
  onChange: (values: VendorFormValues) => void;
}) {
  function set<K extends keyof VendorFormValues>(key: K, value: VendorFormValues[K]) {
    onChange({ ...values, [key]: value });
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="vendor-name">Vendor name</Label>
        <Input
          id="vendor-name"
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="vendor-code">Vendor code</Label>
        <Input
          id="vendor-code"
          value={values.code}
          onChange={(event) => set("code", event.target.value.toUpperCase())}
          placeholder="ABC-001"
          required
        />
        <FieldHint>Unique within this organization.</FieldHint>
      </div>
      <div>
        <Label htmlFor="vendor-email">Email</Label>
        <Input
          id="vendor-email"
          type="email"
          value={values.email}
          onChange={(event) => set("email", event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="vendor-phone">Phone</Label>
        <Input
          id="vendor-phone"
          value={values.phone}
          onChange={(event) => set("phone", event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="vendor-tax">Tax ID</Label>
        <Input
          id="vendor-tax"
          value={values.taxId}
          onChange={(event) => set("taxId", event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="vendor-currency">Currency</Label>
        <Input
          id="vendor-currency"
          maxLength={3}
          value={values.currency}
          onChange={(event) => set("currency", event.target.value.toUpperCase())}
          required
        />
      </div>
      <div>
        <Label htmlFor="vendor-terms">Payment terms (days)</Label>
        <Input
          id="vendor-terms"
          inputMode="numeric"
          value={values.paymentTermsDays}
          onChange={(event) => set("paymentTermsDays", event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="vendor-status">Status</Label>
        <Select
          id="vendor-status"
          value={values.status}
          onChange={(event) => set("status", event.target.value as VendorFormValues["status"])}
        >
          <option value="ACTIVE">Active</option>
          <option value="ON_HOLD">On hold</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="vendor-address">Address</Label>
        <Input
          id="vendor-address"
          value={values.address}
          onChange={(event) => set("address", event.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="vendor-notes">Notes</Label>
        <Textarea
          id="vendor-notes"
          value={values.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
      </div>
    </div>
  );
}

export function CreateVendorButton({ defaultCurrency }: { defaultCurrency: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initialValues({ currency: defaultCurrency }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ vendor: { id: string } }>("/api/vendors", {
        method: "POST",
        body: JSON.stringify(payload(values)),
      });
      toast({ tone: "success", title: "Vendor created" });
      setOpen(false);
      router.push(`/vendors/${result.vendor.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create vendor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> New vendor
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create vendor"
        description="Vendor codes and currencies are used for exact invoice and PO matching."
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-vendor-form" size="sm" loading={loading}>
              Create vendor
            </Button>
          </>
        }
      >
        <form id="create-vendor-form" onSubmit={submit}>
          <VendorFields values={values} onChange={setValues} />
          {error ? (
            <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}
        </form>
      </Modal>
    </>
  );
}

export function EditVendorButton({
  vendorId,
  vendor,
}: {
  vendorId: string;
  vendor: {
    name: string;
    code: string;
    email: string | null;
    phone: string | null;
    taxId: string | null;
    address: string | null;
    currency: string;
    paymentTermsDays: number;
    status: "ACTIVE" | "INACTIVE" | "ON_HOLD";
    notes: string | null;
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(
    initialValues({
      name: vendor.name,
      code: vendor.code,
      email: vendor.email ?? "",
      phone: vendor.phone ?? "",
      taxId: vendor.taxId ?? "",
      address: vendor.address ?? "",
      currency: vendor.currency,
      paymentTermsDays: String(vendor.paymentTermsDays),
      status: vendor.status,
      notes: vendor.notes ?? "",
    }),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/api/vendors/${vendorId}`, {
        method: "PATCH",
        body: JSON.stringify(payload(values)),
      });
      toast({ tone: "success", title: "Vendor updated" });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update vendor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Save className="h-3.5 w-3.5" /> Edit vendor
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit vendor"
        description="Historical invoices keep their recorded values. Matching uses the current vendor currency."
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-vendor-form" size="sm" loading={loading}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-vendor-form" onSubmit={submit}>
          <VendorFields values={values} onChange={setValues} />
          {error ? (
            <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
