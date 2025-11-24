import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Calculator, BarChart3, TrendingUp, BookOpen, HelpCircle, Home, FileText, Briefcase, User } from 'lucide-react';

const Tools = () => {
  const navigate = useNavigate();
  
  const tools = [
    { icon: Calculator, name: 'P&L Calculator', description: 'Calculate profit and loss' },
    { icon: BarChart3, name: 'Charts', description: 'Technical analysis charts' },
    { icon: TrendingUp, name: 'Market Analysis', description: 'Market trends and insights' },
    { icon: BookOpen, name: 'Learning Center', description: 'Trading education' },
    { icon: HelpCircle, name: 'Support', description: 'Help and support' }
  ];

  const bottomNavItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'orders', icon: FileText, label: 'Orders' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'tools', icon: Settings, label: 'Tools' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  const handleTabClick = (tabId) => {
    switch(tabId) {
      case 'home':
        navigate('/dashboard');
        break;
      case 'orders':
        navigate('/orders');
        break;
      case 'portfolio':
        navigate('/portfolio');
        break;
      case 'tools':
        // Already on tools page
        break;
      case 'profile':
        navigate('/profile');
        break;
      default:
        break;
    }
  };

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
        <div className="px-6 py-4">
          <h1 className="text-xl font-bold text-white">Tools</h1>
        </div>
      </div>

      {/* Scrollable Tools Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6 pb-24">
        <div className="grid grid-cols-2 gap-4">
          {tools.map((tool, index) => (
            <div key={index} className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:bg-gray-750 transition-colors">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                  <tool.icon className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">{tool.name}</h3>
                <p className="text-sm text-gray-400">{tool.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-1 py-2">
        <div className="flex justify-around items-center">
          {bottomNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className="flex flex-col items-center py-2"
            >
              <item.icon 
                className={`w-6 h-6 mb-1 ${
                  item.id === 'tools' ? 'text-blue-500' : 'text-gray-400'
                }`} 
              />
              <span className={`text-xs font-medium ${
                item.id === 'tools' ? 'text-blue-500' : 'text-gray-400'
              }`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Tools;
