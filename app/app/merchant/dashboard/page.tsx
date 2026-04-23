// app/merchant/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Customer {
  user_id: string;
  current_state: string;
  total_visits: number;
  days_since_last_visit: number;
  avg_visit_gap_days: number;
  gap_ratio: number;
  risk_segment: string;
}

export default function MerchantDashboard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    at_risk: 0,
    churned: 0,
    revenue_opportunity: 0,
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    const { data, error } = await supabase
      .from('customer_scores')
      .select('*')
      .eq('venue_id', 'e1a6c15d-8ccc-4f58-aefb-8bea46e39918')
      .order('gap_ratio', { ascending: false });

    if (data) {
      const enriched = data.map((c) => ({
        ...c,
        risk_segment: getRiskSegment(c.gap_ratio, c.current_state),
      }));

      setCustomers(enriched);
      
      // Calculate stats
      const atRisk = enriched.filter(c => c.gap_ratio > 1.3 && c.gap_ratio <= 2.5).length;
      const churned = enriched.filter(c => c.gap_ratio > 2.5).length;
      
      setStats({
        total: enriched.length,
        at_risk: atRisk,
        churned: churned,
        revenue_opportunity: (atRisk + churned) * 70,
      });
    }

    setLoading(false);
  }

  function getRiskSegment(gapRatio: number, state: string): string {
    if (gapRatio > 2.5) return 'Churned';
    if (gapRatio > 1.3 && state === 'R') return 'At Risk';
    if (gapRatio > 1.0) return 'On Fence';
    return 'Loyal';
  }

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Alkami Customer Intelligence</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">Total Customers</div>
          <div className="text-3xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-orange-50 p-6 rounded-lg shadow">
          <div className="text-sm text-orange-600">At Risk</div>
          <div className="text-3xl font-bold text-orange-600">{stats.at_risk}</div>
        </div>
        <div className="bg-red-50 p-6 rounded-lg shadow">
          <div className="text-sm text-red-600">Churned</div>
          <div className="text-3xl font-bold text-red-600">{stats.churned}</div>
        </div>
        <div className="bg-green-50 p-6 rounded-lg shadow">
          <div className="text-sm text-green-600">Recovery Potential</div>
          <div className="text-3xl font-bold text-green-600">${stats.revenue_opportunity}</div>
        </div>
      </div>

      {/* At-Risk Customers Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Customers Needing Attention</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Visits</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Since</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gap Ratio</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {customers
              .filter(c => c.gap_ratio > 1.0)
              .slice(0, 50)
              .map((customer) => (
                <tr key={customer.user_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      customer.risk_segment === 'Churned' ? 'bg-red-100 text-red-800' :
                      customer.risk_segment === 'At Risk' ? 'bg-orange-100 text-orange-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {customer.risk_segment}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono">{customer.user_id.slice(0, 8)}...</td>
                  <td className="px-6 py-4 text-sm">{customer.total_visits}</td>
                  <td className="px-6 py-4 text-sm">{customer.days_since_last_visit}</td>
                  <td className="px-6 py-4 text-sm font-bold">{customer.gap_ratio.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                      Send SMS
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}