const AssetGraph = require('assetgraph-builder');

const includeSvgUseFragmentsTransform = function (relationQuery) {
  relationQuery = relationQuery || {};

  var transformQuery = Object.assign({
    type: 'SvgUse',
    href: /^[^#]/,
    to: Object.assign({
      isLoaded: true
    }, relationQuery.to)
  }, relationQuery);

  return function includeSvgUseFragments(assetGraph) {
    var relations = assetGraph.findRelations(transformQuery);
    var potentialCleanupAssets = [];

    relations.forEach(function (relation) {
      var fromDocument = relation.from.parseTree;
      var toDocument = relation.to.parseTree;
      var id = relation.href.split('#')[1];
      var fragment = id && toDocument.getElementById(id);
      var fromWasChanged = false;

      if (fragment) {
        if (!potentialCleanupAssets.includes(relation.to)) {
          potentialCleanupAssets.push(relation.to);
        }

        var defs = fromDocument.getElementsByTagName('defs')[0];

        if (!defs) {
          defs = fromDocument.firstChild.insertBefore(fromDocument.createElement('defs'), fromDocument.firstChild.firstChild || null);
        }

        defs.appendChild(fragment.cloneNode(true));
        relation.to = relation.from;
        relation.href = '#' + id;

        relation.refreshHref();
        fromWasChanged = true;
      }

      if (fromWasChanged) {
        relation.from.markDirty();
      }
    });

    potentialCleanupAssets.forEach(function (asset) {
      if (asset.incomingRelations.length === 0 && !asset.isInitial) {
        assetGraph.removeAsset(asset);
      }
    });
  };
}

AssetGraph.registerTransform(includeSvgUseFragmentsTransform, 'includeSvgUseFragments');

function inlineFragments (assetGraph) {
  const assets = assetGraph.findAssets({ type: 'Svg' });

  assets.forEach(asset => {
    const document = asset.parseTree;

    asset.outgoingRelations.forEach(rel => {
      if (rel.type === 'SvgUse' && rel.href.indexOf('#') === 0) {
        const node = rel.node;
        const attributes = Array.from(node.attributes).filter(n => n.name !== 'href');

        const target = document.getElementById(node.getAttribute('href').replace('#', ''));

        if (target) {
          const clone = target.cloneNode(true);

          attributes.forEach(a => clone.setAttribute(a.name, a.value));

          node.parentNode.replaceChild(clone, node);
        }
      }
    });

    Array.from(document.getElementsByTagName('defs'))
      .forEach(def => def.parentNode.removeChild(def));
  });
}

function generatePngAlternatives(assetGraph) {
  const assets = assetGraph.findAssets({ type: 'Svg', isInitial: true });
  const dprVariations = [
    {
      fileNameSuffix: '',
      multiplier: 1
    },
    {
      fileNameSuffix: '@2x',
      multiplier: 2
    },
    {
      fileNameSuffix: '@3x',
      multiplier: 3
    },
    {
      fileNameSuffix: '@4x',
      multiplier: 4
    }
  ];

  assets.forEach(asset => {
    const [width, height] = asset.parseTree.firstChild
      .getAttribute('viewBox')
      .split(' ')
      .slice(2)
      .map(Number);

    const fileNamePrefix = asset.fileName.split('.').slice(0, -1).join('.');

    dprVariations.forEach(v => {
      const futureFileName = `${fileNamePrefix}${v.fileNameSuffix}.png`;
      const dprWidth = width * v.multiplier;
      const dprHeight = height * v.multiplier;

      const pngAssetConfig = assetGraph.resolveAssetConfig({
        type: 'Svg',
        url: `${asset.url.replace(asset.fileName, futureFileName)}?inkscape=--export-width=${dprWidth}`,
        text: asset.text,
        devicePixelRatio: v.multiplier
      });

      assetGraph.addAsset(pngAssetConfig);
    });
  });
}

new AssetGraph({ root: 'src' })
  .logEvents()
  .loadAssets('*.svg')
  .populate()
  .includeSvgUseFragments()
  .queue(inlineFragments)
  .minifySvgAssetsWithSvgo()
  .queue(generatePngAlternatives)
  .processImages({}, { autoLossless: true })
  .queue(assetGraph => {
    assetGraph
      .findAssets({ type: 'Png' })
      .forEach(a => {
        const nameParts = a.fileName.split('.');
        a.fileName = [nameParts[0], nameParts.pop()].join('.');
      });
  })
  .writeAssetsToDisc({ isLoaded: true }, 'dist')
  .run();
