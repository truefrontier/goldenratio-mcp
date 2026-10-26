const gr = 1.61803398875; // The Golden Ratio
const grBase = 100000;

const grArr = [
  null,
  grBase / gr / gr / gr / gr / gr,
  grBase / gr / gr / gr / gr,
  grBase / gr / gr / gr,
  grBase / gr / gr,
  grBase / gr,
  grBase,
  grBase * gr,
  grBase * gr * gr,
  grBase * gr * gr * gr,
  grBase * gr * gr * gr * gr,
  grBase * gr * gr * gr * gr * gr,
];

const maxFit = (target, max) => {
  if (Math.round(grArr[max]) <= Math.round(target)) {
    return max;
  }
  max--;
  return max ? maxFit(target, max) : false;
};

export const findGoldenMatches = (arr1, arr2 = [], arrMax = 5) => {
  let results = [];
  let resultsCheck = [];

  if (!arr1.length && !arr2.length) return results;

  const arr1Total = arr1.reduce((sum, cur) => {
    sum += grArr[cur];
    return sum;
  }, 0);

  const arr2Total = arr2.reduce((sum, cur) => {
    sum += grArr[cur];
    return sum;
  }, 0);

  const arrTotal = Math.abs(arr1Total - arr2Total);

  let foundArr = [];
  let foundTotal = 0;

  // max is the number of the highest
  // which is also the index of the next lowest
  const find = (target, max = 12, useFit = false) => {
    let fit = maxFit(target, max);
    if (fit) {
      // store in foundArr and keep going
      foundArr.push(fit);
      foundTotal += grArr[fit];
      find(arrTotal - foundTotal, useFit ? useFit(fit) : 12, useFit);
    } else {
      // store foundArr accordingly
      let [nextMax] = foundArr;
      if (foundTotal && Math.round(foundTotal) === Math.round(arrTotal)) {
        foundArr.sort((a, b) => a - b).reverse();
        let foundArrStr = foundArr.join(',');
        if (!resultsCheck.includes(foundArrStr)) {
          results.push(foundArr);
          resultsCheck.push(foundArrStr);
        }
      }

      if (nextMax >= 1) {
        foundArr = [];
        foundTotal = 0;
        find(arrTotal, nextMax - 1, useFit);
      }
    }
  };

  find(arrTotal);
  find(arrTotal, 12, (fit) => fit + 12);
  find(arrTotal, 12, (fit) => fit + 11);
  find(arrTotal, 12, (fit) => fit + 10);
  find(arrTotal, 12, (fit) => fit + 9);
  find(arrTotal, 12, (fit) => fit + 8);
  find(arrTotal, 12, (fit) => fit + 7);
  find(arrTotal, 12, (fit) => fit + 6);
  find(arrTotal, 12, (fit) => fit + 5);
  find(arrTotal, 12, (fit) => fit + 4);
  find(arrTotal, 12, (fit) => fit + 3);
  find(arrTotal, 12, (fit) => fit + 2);
  find(arrTotal, 12, (fit) => fit + 1);
  find(arrTotal, 12, (fit) => fit);

  const sortResults = (a, b) => {
    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;
    if (a.length === b.length) {
      return a[0] > b[0] ? -1 : 1;
    }
  };

  results.sort(sortResults);

  return { matches: results, equal: Math.round(arr1Total) === Math.round(arr2Total) };
};
