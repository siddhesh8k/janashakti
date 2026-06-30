import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Users, Clock, AlertTriangle, Lightbulb, Trash2,
         Droplets, Construction, TrafficCone, Building2, GraduationCap, Video,
         Trees, Footprints, HardHat, Volume2, AlertCircle, Waves, PawPrint,
         Factory, CloudRain, Droplet } from 'lucide-react';
import SeverityBadge from './SeverityBadge';
import PressureMeter from './PressureMeter';
import { statusColor } from '../theme/components';
import { issueColorMap } from '../constants/issueTypes';

const ICON_MAP = {
  Pothole:         MapPin,
  Streetlight:     Lightbulb,
  Garbage:         Trash2,
  'Water Leakage': Droplets,
  Infrastructure:  Construction,
  'Traffic Signal': TrafficCone,
  // Extended civic categories (real dataset taxonomy).
  'Broken Road':                Construction,
  'Broken Streetlight':         Lightbulb,
  'Garbage Dumping':            Trash2,
  'Open Manhole':               AlertCircle,
  'Sewage Overflow':            Waves,
  'Water Logging':              CloudRain,
  'Water Supply Issue':         Droplet,
  'Air Pollution':              Factory,
  'Noise Pollution':            Volume2,
  'Dangerous Tree':             Trees,
  'Footpath Encroachment':      Footprints,
  'Illegal Construction':       HardHat,
  'Stray Animal Menace':        PawPrint,
  'Traffic Signal Malfunction': TrafficCone,
  Other:           AlertTriangle,
};

function IssueCard({ issue, compact = false, fillHeight = false }) {
  const navigate = useNavigate();
  const Icon = ICON_MAP[issue.issueType] || AlertTriangle;
  const iconColor = issueColorMap[issue.issueType] || '#64748b';
  const borderColor = statusColor(issue.status);

  const timeAgo = (ts) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div
      onClick={() => navigate(`/issue/${issue.id}`)}
      style={{
        backgroundColor: '#0d1b2e', borderRadius: '14px',
        border: '0.5px solid #1a2f4a', padding: '14px 14px 14px 16px',
        marginBottom: fillHeight ? 0 : '10px', cursor: 'pointer',
        borderLeft: `3px solid ${borderColor}`,
        transition: 'background-color 0.15s ease, transform 0.18s ease, box-shadow 0.18s ease',
        // Equal-height cards (e.g. the Critical Alerts carousel): fill the wrapper
        // and push the meta row to the bottom so every tile is the same size.
        ...(fillHeight && { height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }),
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#152540';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 12px 28px -20px rgba(0, 0, 0, 0.95)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#0d1b2e';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <Icon size={16} color={iconColor} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span title={issue.issueType} style={{ fontSize: '14px', fontWeight: '600', color: '#f0f6ff',
                         minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {issue.issueType}
          </span>
          {issue.mediaType === 'video' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0,
                           padding: '2px 7px', borderRadius: '999px',
                           backgroundColor: '#00d4ff1a', color: '#00d4ff',
                           fontSize: '10px', fontWeight: '600' }}>
              <Video size={10} strokeWidth={1.5} /> Video
            </span>
          )}
        </div>
        <span style={{ flexShrink: 0 }}><SeverityBadge severity={issue.severity} /></span>
      </div>

      {issue.description && (
        <p title={issue.description} style={{
          fontSize: '13px', color: '#94a3b8', lineHeight: 1.5,
          marginBottom: '10px',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {issue.description}
        </p>
      )}

      {issue.adoptedBy && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          marginBottom: '8px', padding: '4px 10px',
          backgroundColor: '#3b82f61a', borderRadius: '6px',
          width: 'fit-content',
        }}>
          {issue.adoptedBy.type === 'college'
            ? <GraduationCap size={11} color="#3b82f6" strokeWidth={1.5} />
            : <Building2 size={11} color="#3b82f6" strokeWidth={1.5} />
          }
          <span style={{ fontSize: '10px', color: '#3b82f6', fontWeight: '600' }}>
            Adopted by {issue.adoptedBy.name}
          </span>
        </div>
      )}

      {!compact && <PressureMeter confirmations={issue.confirmations} compact />}

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: '8px', marginTop: fillHeight ? 'auto' : '8px',
        paddingTop: fillHeight ? '8px' : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
          {issue.locationText && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0,
                           fontSize: '11px', color: '#4a6280' }}>
              <MapPin size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <span title={issue.locationText || ''} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {issue.locationText?.split(',')[0] || ''}
              </span>
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0,
                         fontSize: '11px', color: '#4a6280' }}>
            <Users size={11} strokeWidth={1.5} />
            {issue.confirmations || 0}
          </span>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0,
                       fontSize: '11px', color: '#4a6280' }}>
          <Clock size={11} strokeWidth={1.5} />
          {timeAgo(issue.createdAt)}
        </span>
      </div>

      {issue.wallOfShame && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          marginTop: '8px', padding: '4px 8px',
          backgroundColor: '#ef44441a', borderRadius: '6px',
        }}>
          <AlertTriangle size={12} color="#ef4444" strokeWidth={1.5} />
          <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: '600' }}>
            CHRONIC IGNORED ISSUE
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(IssueCard);
