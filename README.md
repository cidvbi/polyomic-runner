#PolyomicRunner

Job Runner for Polyomic.

##Installation

````
npm install -g polyomicrunner
````

## Execute

````
> polyrun

Options:
  -c, --config     Path to Polyrun Config    [required]  [default: "/etc/polyrun.conf"]
  -j, --job        Polyomic Job URL                             
  -f, --file       Polyomic Job JSON File                       
  -C, --nocleanup  Skip Cleanup of Working Dir on Job Completion
````

## Configuration

Create a polyrun.conf.  Optionally store this in /etc/ to avoid having to supply it on the command line.
