import { Quest1Loader } from './Quest1Loader';

interface Props {
  size?: number;
}

export default function Quest1LogoMark({ size = 22 }: Props) {
  return <Quest1Loader isLoading={false} size={size} />;
}
