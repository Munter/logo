const AssetGraph = require('assetgraph');

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

new AssetGraph({ root: 'src' })
  .logEvents()
  .loadAssets('*.svg')
  .populate()
  .includeSvgUseFragments()
  .writeAssetsToDisc({}, 'dist')
  .run();
