import { View, StyleSheet } from 'react-native';
import { Users } from 'lucide-react-native';
import PersonBadges from '../DashboardV2/PersonBadges';
import WidgetCard from './WidgetCard';

export default function FamilyWidget({
    entities,
    alertRules,
    haUrl,
    span = 2,
    totalColumns = 4,
}) {
    const people = entities.filter(e => e.entity_id.startsWith('person.'));
    if (people.length === 0) return null;

    return (
        <WidgetCard title="Family" icon={Users} span={span} totalColumns={totalColumns}>
            <PersonBadges
                entities={entities}
                alertRules={alertRules}
                haUrl={haUrl}
            />
        </WidgetCard>
    );
}
