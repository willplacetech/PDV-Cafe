import React from 'react';

const SkeletonLista = ({ itemCount, itemHeight }) => {
  const skeletonItems = Array.from({ length: itemCount }, (_, index) => (
    <div key={index} style={{ height: itemHeight, marginBottom: '12px' }}></div>
  ));

  return (
    <div className=\"skeleton-lista\">
      {skeletonItems}
      <style>{
        .skeleton-lista {
          display: flex;
          flex-direction: column;
        }
        .skeleton-lista > div {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px;
        }
        @keyframes loading {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      }</style>
    </div>
  );
};

export default SkeletonLista;
