// app/merchant/dashboard/page.tsx
'use client';
 
import { useEffect, useState } from 'react';
 
interface AtRiskCustomer {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  current_state: string;
  gap_ratio: number;
  days_since_last_visit: number;
  avg_visit_gap_days: number;
  total_visits: number;
  potential_revenue_cents: number;
  churn_score_10: number | null;
}
 
interface RevenueStats {
  churned_customers: number;
  at_risk_customers: number;
  total_potential_revenue: number;
  avg_gap_ratio: number;
}
 
export default function DemandIntelligenceDashboard() {
  const [atRiskCustomers, setAtRiskCustomers] = useState<AtRiskCustomer[]>([]);
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingIntervention, setSendingIntervention] = useState<string | null>(null);
 
  const ALKAMI_VENUE_ID = 'e1a6c15d-8ccc-4f58-aefb-8bea46e39918';
 
  useEffect(() => {
    fetchDemandIntelligence();
  }, []);
 
  async function fetchDemandIntelligence() {
    try {
      // Fetch from API route instead of database
      const response = await fetch(`/api/intelligence/at-risk-customers?venue_id=${ALKAMI_VENUE_ID}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch customer intelligence');
      }
 
      const data = await response.json();
      
      setAtRiskCustomers(data.customers);
      setStats(data.stats);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching demand intelligence:', err);
      setLoading(false);
    }
  }
 
  async function sendIntervention(customer: AtRiskCustomer) {
    setSendingIntervention(customer.user_id);
    
    try {
      // Call your intervention API
      const response = await fetch('/api/interventions/send-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: customer.user_id,
          venue_id: ALKAMI_VENUE_ID,
        }),
      });
 
      if (!response.ok) throw new Error('Failed to send intervention');
 
      alert(`Intervention sent to ${customer.name}!`);
      fetchDemandIntelligence(); // Refresh data
    } catch (err) {
      console.error('Error sending intervention:', err);
      alert('Failed to send intervention');
    } finally {
      setSendingIntervention(null);
    }
  }
 
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading demand intelligence...</p>
        </div>
      </div>
    );
  }
 
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Demand Intelligence</h1>
          <p className="text-gray-600 mt-2">AI-powered customer recovery for Alkami Barbershop</p>
        </div>
 
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm font-medium text-gray-600">Churned Customers</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{stats.churned_customers}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm font-medium text-gray-600">High Risk (Gap {'>'} 1.3x)</p>
              <p className="text-3xl font-bold text-orange-600 mt-2">{stats.at_risk_customers}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm font-medium text-gray-600">Revenue at Risk</p>
              <p className="text-3xl font-bold text-green-600 mt-2">${(stats.total_potential_revenue / 100).toFixed(0)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm font-medium text-gray-600">Avg Gap Ratio</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{stats.avg_gap_ratio.toFixed(2)}x</p>
            </div>
          </div>
        )}
 
        {/* At-Risk Customer Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">At-Risk Customers</h2>
            <p className="text-sm text-gray-600 mt-1">Sorted by urgency (highest gap ratio first)</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gap Ratio</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days Overdue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visits</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Potential $</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {atRiskCustomers.map((customer) => (
                  <tr key={customer.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                        <div className="text-sm text-gray-500">{customer.email}</div>
                        <div className="text-xs text-gray-400">{customer.phone}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Churned
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-semibold">{customer.gap_ratio.toFixed(2)}x</div>
                      <div className="text-xs text-gray-500">vs {customer.avg_visit_gap_days}d avg</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {customer.days_since_last_visit} days
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {customer.total_visits}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                      ${(customer.potential_revenue_cents / 100).toFixed(0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => sendIntervention(customer)}
                        disabled={sendingIntervention === customer.user_id}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {sendingIntervention === customer.user_id ? 'Sending...' : 'Send SMS'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}