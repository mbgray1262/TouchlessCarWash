'use client';

interface LogoImageProps {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
}

export default function LogoImage({ src, alt, className, wrapperClassName }: LogoImageProps) {
  return (
    <div className={wrapperClassName} onError={undefined}>
      <img
        src={src}
        alt={alt}
        className={className}
        onError={(e) => {
          const wrapper = e.currentTarget.parentElement;
          if (wrapper) wrapper.style.display = 'none';
        }}
      />
    </div>
  );
}
