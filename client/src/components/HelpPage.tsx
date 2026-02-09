import React, { useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Wifi,
  Moon,
  WifiOff,
  Clock,
  Activity,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface HelpPageProps {
  onBack: () => void;
}

// Example RTT data for the chart
const exampleData = [
  { time: "0s", rtt: 180, state: "Online" },
  { time: "5s", rtt: 210, state: "Online" },
  { time: "10s", rtt: 195, state: "Online" },
  { time: "15s", rtt: 520, state: "Standby" },
  { time: "20s", rtt: 480, state: "Standby" },
  { time: "25s", rtt: 1200, state: "Offline" },
  { time: "30s", rtt: 1500, state: "Offline" },
  { time: "35s", rtt: 190, state: "Online" },
  { time: "40s", rtt: 175, state: "Online" },
];

const definitions = [
  {
    term: "Online",
    icon: Wifi,
    color: "text-green-600",
    bg: "bg-green-50",
    description:
      "Device actively responded within threshold (~2s). User likely has the app open and active.",
  },
  {
    term: "Standby",
    icon: Moon,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    description:
      "Device responded but slower than active threshold. App may be backgrounded or phone is locked.",
  },
  {
    term: "Offline",
    icon: WifiOff,
    color: "text-red-600",
    bg: "bg-red-50",
    description:
      "No response within timeout (~10s). Device likely disconnected or app is closed.",
  },
  {
    term: "RTT",
    icon: Clock,
    color: "text-blue-600",
    bg: "bg-blue-50",
    description:
      "Round-Trip Time — milliseconds between sending a probe and receiving a delivery receipt.",
  },
  {
    term: "Threshold",
    icon: Activity,
    color: "text-purple-600",
    bg: "bg-purple-50",
    description:
      "Dynamic cutoff (based on rolling average) that separates Online from Standby states.",
  },
];

const usageSteps = [
  {
    step: 1,
    title: "Scan QR Code",
    description:
      "Connect your WhatsApp by scanning the QR code with your phone's WhatsApp app. This links your session to the tracker. Your existing chats remain unchanged.",
  },
  {
    step: 2,
    title: "Add Contact",
    description:
      'Enter the phone number (with country code, e.g., +1234567890) of the contact you want to track. Click "Add" to start monitoring.',
  },
  {
    step: 3,
    title: "Read Graphs",
    description:
      "The real-time chart shows RTT values over time. Lower values (green zone) indicate the user is online. Higher values suggest standby or offline status.",
  },
  {
    step: 4,
    title: "Analyze Trends",
    description:
      "Use the history view to see patterns: when are they most active? How long do their sessions typically last? Identify their online habits.",
  },
];

const faqs = [
  {
    question: "Does scanning the QR share my data with tracked contacts?",
    answer:
      "No. The QR code links your WhatsApp session to your own server instance. Tracked contacts receive no data, no notifications, and have no way to detect that monitoring is occurring.",
  },
  {
    question: "Can the tracked contacts see they are being monitored?",
    answer:
      "No. The probes sent are completely invisible — they don't appear in chat, don't trigger read receipts, and don't cause any notifications on the target's device.",
  },
  {
    question: "Is my WhatsApp account at risk?",
    answer:
      "This tool uses unofficial WhatsApp APIs. While we've designed it to be as safe as possible, there is a theoretical risk of account restrictions. Use responsibly and at your own discretion.",
  },
  {
    question: "How accurate is the online detection?",
    answer:
      "Detection accuracy depends on network conditions. In most cases, the system correctly identifies online status within 2-3 seconds. Network jitter may occasionally cause brief false readings.",
  },
];

export function HelpPage({ onBack }: HelpPageProps) {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-white transition-colors"
            aria-label="Go back to dashboard"
          >
            <ArrowLeft size={24} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <HelpCircle size={28} className="text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              How WhatsTrax Works
            </h1>
          </div>
        </div>

        {/* How It Works Section */}
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">How It Works</h2>
          <p className="text-gray-600 mb-6">
            WhatsTrax uses <strong>Round-Trip Time (RTT)</strong> analysis to
            detect device activity. When you add a contact, the app sends silent
            "probe" messages that don't appear in chat. The time it takes to
            receive a delivery receipt indicates whether the target's device is
            active, in standby, or offline.
          </p>

          {/* Example Chart */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-3">
              Example RTT Timeline
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={exampleData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} unit="ms" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => [`${value}ms`, "RTT"]}
                  />
                  <ReferenceLine
                    y={300}
                    stroke="#22c55e"
                    strokeDasharray="5 5"
                    label={{
                      value: "Online Threshold",
                      fill: "#22c55e",
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    y={800}
                    stroke="#eab308"
                    strokeDasharray="5 5"
                    label={{
                      value: "Standby Threshold",
                      fill: "#eab308",
                      fontSize: 10,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rtt"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: "#3b82f6", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Lower RTT = Online • Medium RTT = Standby • High RTT = Offline
            </p>
          </div>
        </section>

        {/* Definitions Section */}
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Key Definitions
          </h2>
          <div className="grid gap-3">
            {definitions.map((def) => (
              <div
                key={def.term}
                className={`${def.bg} rounded-lg p-4 flex items-start gap-4`}
              >
                <def.icon size={24} className={def.color} />
                <div>
                  <h3 className={`font-semibold ${def.color}`}>{def.term}</h3>
                  <p className="text-gray-600 text-sm">{def.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Usage Guide Section */}
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Usage Guide</h2>
          <div className="space-y-4">
            {usageSteps.map((step) => (
              <div key={step.step} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                  {step.step}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{step.title}</h3>
                  <p className="text-gray-600 text-sm">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy FAQ Section */}
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Privacy & Security FAQ
          </h2>
          <div className="space-y-2">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedFaq(expandedFaq === index ? null : index)
                  }
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-800">
                    {faq.question}
                  </span>
                  {expandedFaq === index ? (
                    <ChevronUp size={20} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={20} className="text-gray-400" />
                  )}
                </button>
                {expandedFaq === index && (
                  <div className="px-4 pb-4 text-gray-600 text-sm">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Back Button */}
        <div className="flex justify-center">
          <button
            onClick={onBack}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
