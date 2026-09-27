declare module 'react-native-vector-icons/MaterialCommunityIcons' {
  import { Component } from 'react';
  import { IconProps } from 'react-native-vector-icons/Icon';
  export default class MaterialCommunityIcons extends Component<IconProps> {}
}

declare module 'lucide-react-native' {
  import { ComponentType } from 'react';
  import { SvgProps } from 'react-native-svg';

  export interface LucideProps extends SvgProps {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
  }

  export const Calculator: ComponentType<LucideProps>;
  export const Package: ComponentType<LucideProps>;
  export const Users: ComponentType<LucideProps>;
  export const Receipt: ComponentType<LucideProps>;
  export const Truck: ComponentType<LucideProps>;
  export const BarChart3: ComponentType<LucideProps>;
  export const HelpCircle: ComponentType<LucideProps>;
  export const Plus: ComponentType<LucideProps>;
  export const Minus: ComponentType<LucideProps>;
  export const X: ComponentType<LucideProps>;
  export const XCircle: ComponentType<LucideProps>;
  export const Edit: ComponentType<LucideProps>;
  export const Pencil: ComponentType<LucideProps>;
  export const Trash2: ComponentType<LucideProps>;
  export const RefreshCw: ComponentType<LucideProps>;
  export const LogOut: ComponentType<LucideProps>;
  export const Filter: ComponentType<LucideProps>;
  export const RotateCcw: ComponentType<LucideProps>;
  export const CornerUpLeft: ComponentType<LucideProps>;
  export const Phone: ComponentType<LucideProps>;
  export const Mail: ComponentType<LucideProps>;
  export const Lock: ComponentType<LucideProps>;
  export const Eye: ComponentType<LucideProps>;
  export const EyeOff: ComponentType<LucideProps>;
  export const History: ComponentType<LucideProps>;
  export const ShoppingCart: ComponentType<LucideProps>;
  export const ShoppingBag: ComponentType<LucideProps>;
  export const ShoppingBasket: ComponentType<LucideProps>;
  export const Store: ComponentType<LucideProps>;
  export const UserPlus: ComponentType<LucideProps>;
  export const UserCheck: ComponentType<LucideProps>;
  export const UserX: ComponentType<LucideProps>;
  export const UserSearch: ComponentType<LucideProps>;
  export const UserEdit: ComponentType<LucideProps>;
  export const Banknote: ComponentType<LucideProps>;
  export const BookOpen: ComponentType<LucideProps>;
  export const Scale: ComponentType<LucideProps>;
  export const PackageCheck: ComponentType<LucideProps>;
  export const FileText: ComponentType<LucideProps>;
  export const PlusCircle: ComponentType<LucideProps>;
  export const MinusCircle: ComponentType<LucideProps>;
  export const GitBranch: ComponentType<LucideProps>;
  export const List: ComponentType<LucideProps>;
  export const AlertCircle: ComponentType<LucideProps>;
  export const CheckCircle: ComponentType<LucideProps>;
  export const CheckCircle2: ComponentType<LucideProps>;
  export const Check: ComponentType<LucideProps>;
  export const LayoutGrid: ComponentType<LucideProps>;
  export const Shapes: ComponentType<LucideProps>;
  export const UserCog: ComponentType<LucideProps>;
  export const HardHat: ComponentType<LucideProps>;
  export const Search: ComponentType<LucideProps>;
  export const ScanBarcode: ComponentType<LucideProps>;
  export const Settings: ComponentType<LucideProps>;
  export const QrCode: ComponentType<LucideProps>;
  export const Percent: ComponentType<LucideProps>;
  export const Wallet: ComponentType<LucideProps>;
  export const CreditCard: ComponentType<LucideProps>;
  export const Building: ComponentType<LucideProps>;
  export const DollarSign: ComponentType<LucideProps>;
  export const ChevronRight: ComponentType<LucideProps>;
  export const ChevronLeft: ComponentType<LucideProps>;
  export const ArrowLeft: ComponentType<LucideProps>;
  export const ArrowRight: ComponentType<LucideProps>;
  export const Printer: ComponentType<LucideProps>;
  export const User: ComponentType<LucideProps>;
  export const Sprout: ComponentType<LucideProps>;
  export const Droplets: ComponentType<LucideProps>;
  export const Sparkles: ComponentType<LucideProps>;
  export const CircleAlert: ComponentType<LucideProps>;
  export const AlertTriangle: ComponentType<LucideProps>;
  export const Info: ComponentType<LucideProps>;
  export const Tag: ComponentType<LucideProps>;
  export const Calendar: ComponentType<LucideProps>;
  export const Clock: ComponentType<LucideProps>;
  export const Circle: ComponentType<LucideProps>;
  export const ShieldAlert: ComponentType<LucideProps>;
  export const ShieldCheck: ComponentType<LucideProps>;
  export const Bell: ComponentType<LucideProps>;
}
