"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../../lib/supabaseClient";

interface Plan {
  id: string;
  code: string;
  name: string;
  price: number;
  duration_days: number;
  target_tier: string;
  is_active: boolean;
}

export default function PlansManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isNew, setIsNew] = useState(false);

  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("price", { ascending: true });

    if (data) setPlans(data);
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    // Validation
    if (!editingPlan.code || !editingPlan.name) {
      alert("Code and Name are required");
      return;
    }

    try {
      if (isNew) {
        // Create new plan - Explicitly exclude ID so DB defaults kick in
        const { error } = await supabase.from("subscription_plans").insert([
          {
            code: editingPlan.code,
            name: editingPlan.name,
            price: editingPlan.price,
            duration_days: editingPlan.duration_days,
            target_tier: editingPlan.target_tier,
            is_active: editingPlan.is_active,
            description: (editingPlan as any).description,
          },
        ]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("subscription_plans")
          .update({
            name: editingPlan.name,
            price: editingPlan.price,
            description: (editingPlan as any).description, // TS workaround
            is_active: editingPlan.is_active,
            duration_days: editingPlan.duration_days,
          })
          .eq("id", editingPlan.id);
        if (error) throw error;
      }

      setEditingPlan(null);
      fetchPlans();
    } catch (err: any) {
      alert("Error saving: " + err.message);
    }
  };

  const deletePlan = async (id: string) => {
    if (!confirm("Are you sure? Use 'Deactivate' instead if history exists."))
      return;
    const { error } = await supabase
      .from("subscription_plans")
      .delete()
      .eq("id", id);
    if (error) alert("Error: " + error.message);
    else fetchPlans();
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">
          Subscription Plans
        </h2>
        <button
          onClick={() => {
            setEditingPlan({
              id: "",
              code: "NEW_PLAN",
              name: "",
              price: 100000,
              duration_days: 30,
              target_tier: "PRO",
              is_active: true,
            });
            setIsNew(true);
          }}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-500 font-medium"
        >
          + Add Plan
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                  {plan.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                  {plan.code}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-bold">
                  {new Intl.NumberFormat("vi-VN", {
                    style: "currency",
                    currency: "VND",
                  }).format(plan.price)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {plan.duration_days} days
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      plan.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {plan.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => {
                      setEditingPlan(plan);
                      setIsNew(false);
                    }}
                    className="text-indigo-600 hover:text-indigo-900 mr-4"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deletePlan(plan.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-4">
              {isNew ? "Create Plan" : "Edit Plan"}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Code
                  </label>
                  <input
                    value={editingPlan.code}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, code: e.target.value })
                    }
                    disabled={!isNew}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Name
                  </label>
                  <input
                    value={editingPlan.name}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, name: e.target.value })
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Price (VND)
                  </label>
                  <input
                    type="number"
                    value={editingPlan.price}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        price: Number(e.target.value),
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Duration (Days)
                  </label>
                  <input
                    type="number"
                    value={editingPlan.duration_days}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        duration_days: Number(e.target.value),
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={editingPlan.is_active}
                  onChange={(e) =>
                    setEditingPlan({
                      ...editingPlan,
                      is_active: e.target.checked,
                    })
                  }
                  id="is_active"
                  className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                <label
                  htmlFor="is_active"
                  className="text-sm font-medium text-slate-700"
                >
                  Active
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
