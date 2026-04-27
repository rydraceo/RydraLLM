// components/merchant-hub/CustomerIntelligenceDashboard.tsx
/**
 * MERCHANT HUB: Customer Intelligence Dashboard - TYPE-SAFE VERSION
 * Displays comprehensive Markov predictions in an actionable format
 */
 
import React, { useState } from 'react';
import type { ComprehensiveCustomerIntelligence } from '@/lib/markov/predictions.enhanced';
 
interface CustomerIntelligenceDashboardProps {
  venueId: string;
}
 
export function CustomerIntelligenceDashboard({ venueId }: CustomerIntelligenceDashboardProps) {
  const [selectedTab, setSelectedTab] = useState<'at-risk' | 'opportunities' | 'loyal' | 'all'>('at-risk');
  const [customers, setCustomers] = useState<ComprehensiveCustomerIntelligence[]>([]);
  
  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Customer Intelligence</h1>
        <p className="text-muted">AI-powered insights and recommendations</p>
      </div>
      
      <div className="metrics-row">
        <MetricCard
          title="At Risk"
          value={customers.filter(c => c.primary_intervention.segment === 'at_risk').length}
          subtitle="Need urgent attention"
          trend="up"
          color="red"
        />
        <MetricCard
          title="On the Fence"
          value={customers.filter(c => c.primary_intervention.segment === 'on_the_fence').length}
          subtitle="High ROI segment"
          trend="neutral"
          color="amber"
        />
        <MetricCard
          title="Loyal Customers"
          value={customers.filter(c => c.primary_intervention.segment === 'loyal').length}
          subtitle="Low churn risk"
          trend="down"
          color="green"
        />
        <MetricCard
          title="Projected Revenue"
          value="$47,250"
          subtitle="Next 30 days"
          trend="up"
          color="purple"
        />
      </div>
      
      <div className="tabs">
        <TabButton
          active={selectedTab === 'at-risk'}
          onClick={() => setSelectedTab('at-risk')}
          badge={12}
        >
          🚨 At Risk
        </TabButton>
        <TabButton
          active={selectedTab === 'opportunities'}
          onClick={() => setSelectedTab('opportunities')}
          badge={45}
        >
          💡 Opportunities
        </TabButton>
        <TabButton
          active={selectedTab === 'loyal'}
          onClick={() => setSelectedTab('loyal')}
        >
          ⭐ Loyal
        </TabButton>
        <TabButton
          active={selectedTab === 'all'}
          onClick={() => setSelectedTab('all')}
        >
          📊 All Customers
        </TabButton>
      </div>
      
      <div className="customer-table">
        <CustomerTableHeader />
        {customers
          .filter(c => {
            if (selectedTab === 'all') return true;
            if (selectedTab === 'at-risk') return c.primary_intervention.segment === 'at_risk';
            if (selectedTab === 'opportunities') return c.primary_intervention.segment === 'on_the_fence';
            if (selectedTab === 'loyal') return c.primary_intervention.segment === 'loyal';
            return true;
          })
          .map((customer, idx) => (
            <CustomerRow key={idx} intelligence={customer} />
          ))
        }
      </div>
    </div>
  );
}
 
// ════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════
 
type MetricColor = 'red' | 'amber' | 'green' | 'purple';
 
function MetricCard({ title, value, subtitle, trend, color }: {
  title: string;
  value: number | string;
  subtitle: string;
  trend: 'up' | 'down' | 'neutral';
  color: MetricColor;
}) {
  const colorClasses: Record<MetricColor, string> = {
    red: 'border-red-200 bg-red-50',
    amber: 'border-amber-200 bg-amber-50',
    green: 'border-green-200 bg-green-50',
    purple: 'border-purple-200 bg-purple-50'
  };
  
  return (
    <div className={`metric-card ${colorClasses[color]}`}>
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-subtitle">
        {subtitle}
        {trend === 'up' && <span className="trend-badge red">↑</span>}
        {trend === 'down' && <span className="trend-badge green">↓</span>}
      </div>
    </div>
  );
}
 
function TabButton({ active, onClick, badge, children }: {
  active: boolean;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`tab-button ${active ? 'active' : ''}`}
    >
      {children}
      {badge && <span className="tab-badge">{badge}</span>}
    </button>
  );
}
 
function CustomerTableHeader() {
  return (
    <div className="table-header">
      <div className="col-customer">Customer</div>
      <div className="col-state">State</div>
      <div className="col-risk">Risk</div>
      <div className="col-clv">CLV</div>
      <div className="col-next-visit">Next Visit</div>
      <div className="col-action">Recommended Action</div>
      <div className="col-send">Send</div>
    </div>
  );
}
 
function CustomerRow({ intelligence }: { intelligence: ComprehensiveCustomerIntelligence }) {
  const [expanded, setExpanded] = useState(false);
  
  const getRiskColor = (score: number): 'red' | 'amber' | 'green' => {
    if (score >= 0.60) return 'red';
    if (score >= 0.35) return 'amber';
    return 'green';
  };
  
  const riskColor = getRiskColor(intelligence.churn_scores.one_month);
  
  return (
    <>
      <div className="table-row" onClick={() => setExpanded(!expanded)}>
        <div className="col-customer">
          <div className="customer-info">
            <div className="customer-avatar">JD</div>
            <div>
              <div className="customer-name">John Doe</div>
              <div className="customer-meta">Last visit: {intelligence.days_since_last_visit}d ago</div>
            </div>
          </div>
        </div>
        
        <div className="col-state">
          <span className="state-badge">{intelligence.current_state}</span>
        </div>
        
        <div className="col-risk">
          <div className="risk-indicator">
            <div className={`risk-bar ${riskColor}`} style={{ width: `${intelligence.churn_scores.one_month * 100}%` }}></div>
            <span className="risk-text">{(intelligence.churn_scores.one_month * 100).toFixed(0)}%</span>
          </div>
        </div>
        
        <div className="col-clv">
          <div className="clv-value">${(intelligence.clv_cents / 100).toFixed(0)}</div>
          <div className="clv-percentile">{intelligence.cohort_comparison.percentile_rank.toFixed(0)}th percentile</div>
        </div>
        
        <div className="col-next-visit">
          <div className="next-visit-days">{intelligence.time_to_next_visit.expected_days}d</div>
          <div className="next-visit-prob">
            {(intelligence.time_to_next_visit.probability_within_30_days * 100).toFixed(0)}% in 30d
          </div>
        </div>
        
        <div className="col-action">
          <div className="action-text">{intelligence.primary_intervention.recommended_action}</div>
          {intelligence.primary_intervention.discount_amount_cents > 0 && (
            <div className="action-discount">
              Offer: ${intelligence.primary_intervention.discount_amount_cents / 100}
            </div>
          )}
        </div>
        
        <div className="col-send">
          <button className="send-button">
            Send SMS
          </button>
        </div>
      </div>
      
      {expanded && (
        <div className="expanded-row">
          <div className="expanded-content">
            <div className="detail-section">
              <h4>Churn Risk Timeline</h4>
              <div className="timeline-chart">
                <TimelineBar label="7 days" value={intelligence.churn_scores.one_week} color="blue" />
                <TimelineBar label="30 days" value={intelligence.churn_scores.one_month} color="amber" />
                <TimelineBar label="3 months" value={intelligence.churn_scores.three_months} color="red" />
                <TimelineBar label="1 year" value={intelligence.churn_scores.one_year} color="purple" />
              </div>
            </div>
            
            <div className="detail-section">
              <h4>Predictions</h4>
              <div className="predictions-grid">
                <PredictionCard
                  label="Expected visits next year"
                  value={intelligence.expected_visits_next_year.value.toFixed(1)}
                  confidence={`${intelligence.expected_visits_next_year.confidence_low.toFixed(1)} - ${intelligence.expected_visits_next_year.confidence_high.toFixed(1)}`}
                />
                <PredictionCard
                  label="Expected revenue next year"
                  value={`$${(intelligence.expected_revenue_next_year_cents.value / 100).toFixed(0)}`}
                  confidence={`$${(intelligence.expected_revenue_next_year_cents.confidence_low / 100).toFixed(0)} - $${(intelligence.expected_revenue_next_year_cents.confidence_high / 100).toFixed(0)}`}
                />
                <PredictionCard
                  label="Loyalty score"
                  value={`${(intelligence.loyalty_score * 100).toFixed(0)}%`}
                  confidence="Probability of becoming regular"
                />
                <PredictionCard
                  label="Visit frequency"
                  value={intelligence.visit_frequency_trend}
                  confidence={intelligence.visit_frequency_trend === 'declining' ? '⚠️ Needs attention' : '✓ Good'}
                />
              </div>
            </div>
            
            <div className="detail-section">
              <h4>Message Preview</h4>
              <div className="message-preview">
                {intelligence.primary_intervention.message_template}
              </div>
              <div className="message-meta">
                Expected conversion: {(intelligence.primary_intervention.expected_conversion_rate * 100).toFixed(0)}%
                {' · '}
                Expected ROI: {intelligence.primary_intervention.expected_roi.toFixed(1)}x
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
 
type TimelineBarColor = 'blue' | 'amber' | 'red' | 'purple';
 
function TimelineBar({ label, value, color }: { label: string; value: number; color: TimelineBarColor }) {
  const colorClasses: Record<TimelineBarColor, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500'
  };
  
  return (
    <div className="timeline-item">
      <div className="timeline-label">{label}</div>
      <div className="timeline-bar-container">
        <div className={`timeline-bar ${colorClasses[color]}`} style={{ width: `${value * 100}%` }}></div>
      </div>
      <div className="timeline-value">{(value * 100).toFixed(0)}%</div>
    </div>
  );
}
 
function PredictionCard({ label, value, confidence }: { label: string; value: string; confidence: string }) {
  return (
    <div className="prediction-card">
      <div className="prediction-label">{label}</div>
      <div className="prediction-value">{value}</div>
      <div className="prediction-confidence">{confidence}</div>
    </div>
  );
}
 
export default CustomerIntelligenceDashboard;